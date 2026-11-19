import { execFile } from "node:child_process";
import { Buffer } from "node:buffer";
import process from "node:process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const EKIN_ORIGIN = "https://e-kinerja.kemenhub.go.id";
const USER_AGENT =
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0";

function decodeHtml(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function cookiePath(pathname) {
  if (!pathname || pathname[0] !== "/") return "/";
  const lastSlash = pathname.lastIndexOf("/");
  return lastSlash <= 0 ? "/" : pathname.slice(0, lastSlash);
}

function updateCookieJar(cookieJar, setCookieHeaders, requestUrl) {
  const request = new URL(requestUrl);
  for (const header of setCookieHeaders) {
    const [pair, ...attributes] = header.split(";");
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;

    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    const cookie = {
      name,
      value,
      domain: request.hostname.toLowerCase(),
      hostOnly: true,
      path: cookiePath(request.pathname),
      secure: false,
      expiresAt: null,
    };

    for (const attribute of attributes) {
      const [rawName, ...rawValue] = attribute.trim().split("=");
      const attributeName = rawName.toLowerCase();
      const attributeValue = rawValue.join("=");
      if (attributeName === "domain" && attributeValue) {
        cookie.domain = attributeValue.replace(/^\./, "").toLowerCase();
        cookie.hostOnly = false;
      } else if (attributeName === "path" && attributeValue.startsWith("/")) {
        cookie.path = attributeValue;
      } else if (attributeName === "secure") {
        cookie.secure = true;
      } else if (attributeName === "max-age" && /^-?\d+$/.test(attributeValue)) {
        cookie.expiresAt = Date.now() + Number(attributeValue) * 1000;
      } else if (attributeName === "expires") {
        const expiration = Date.parse(attributeValue);
        if (Number.isFinite(expiration)) cookie.expiresAt = expiration;
      }
    }

    const existingIndex = cookieJar.findIndex(
      (item) =>
        item.name === cookie.name &&
        item.domain === cookie.domain &&
        item.path === cookie.path,
    );
    if (cookie.expiresAt !== null && cookie.expiresAt <= Date.now()) {
      if (existingIndex !== -1) cookieJar.splice(existingIndex, 1);
    } else if (existingIndex === -1) {
      cookieJar.push(cookie);
    } else {
      cookieJar[existingIndex] = cookie;
    }
  }
  cookieJar.splice(
    0,
    cookieJar.length,
    ...cookieJar.filter(
      (cookie) => cookie.expiresAt === null || cookie.expiresAt > Date.now(),
    ),
  );
}

function cookieHeader(cookieJar, requestUrl) {
  const url = new URL(requestUrl);
  return cookieJar
    .filter((cookie) => {
      const domainMatches = cookie.hostOnly
        ? url.hostname.toLowerCase() === cookie.domain
        : url.hostname.toLowerCase() === cookie.domain ||
          url.hostname.toLowerCase().endsWith(`.${cookie.domain}`);
      const pathMatches =
        url.pathname === cookie.path ||
        url.pathname.startsWith(
          cookie.path.endsWith("/") ? cookie.path : `${cookie.path}/`,
        );
      return (
        domainMatches &&
        pathMatches &&
        (!cookie.secure || url.protocol === "https:") &&
        (cookie.expiresAt === null || cookie.expiresAt > Date.now())
      );
    })
    .sort((left, right) => right.path.length - left.path.length)
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
}

function extractToken(html) {
  const patterns = [
    /<input\b[^>]*\bname=["']_token["'][^>]*\bvalue=["']([^"']+)["']/i,
    /<meta\b[^>]*\bname=["']csrf-token["'][^>]*\bcontent=["']([^"']+)["']/i,
    /var\s+csrf_token\s*=\s*["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1]);
  }
  return "";
}

function extractCaptchaUrl(html) {
  const container = html.match(
    /<div\b[^>]*class=["'][^"']*div-img-captcha[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  );
  const image = (container?.[1] || html).match(
    /<img\b[^>]*\bsrc=["']([^"']+)["']/i,
  );
  return image ? new URL(decodeHtml(image[1]), EKIN_ORIGIN).toString() : "";
}

function extractPageArraySource(page, name) {
  const pattern = new RegExp(
    `var\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(\\[[\\s\\S]*?\\]);`,
    "i",
  );
  const match = page.match(pattern);
  return match ? match[0] : "";
}

function extractPageObjectSource(page, name) {
  const pattern = new RegExp(
    `var\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(\\{(?:"(?:\\\\.|[^"\\\\])*"|[^";])*?\\})\\s*;`,
    "i",
  );
  const match = page.match(pattern);
  return match ? match[0] : "";
}

export class EkinClient {
  constructor({ fetchImpl = globalThis.fetch, recognizeCaptcha } = {}) {
    this.fetchImpl = fetchImpl;
    this.recognizeCaptcha = recognizeCaptcha || this.recognizeCaptchaWithTesseract;
  }

  async request(url, { method = "GET", headers = {}, body } = {}, cookieJar = []) {
    let target = new URL(url, EKIN_ORIGIN);
    if (target.origin !== EKIN_ORIGIN) {
      throw new Error("Permintaan ke host E-Kinerja yang tidak diizinkan.");
    }

    let currentMethod = method;
    let currentBody = body;
    let currentHeaders = { "User-Agent": USER_AGENT, ...headers };
    for (let redirects = 0; redirects <= 10; redirects += 1) {
      const cookies = cookieHeader(cookieJar, target);
      if (cookies) currentHeaders.Cookie = cookies;

      const response = await this.fetchImpl(target, {
        method: currentMethod,
        headers: currentHeaders,
        body: currentBody,
        redirect: "manual",
        signal: AbortSignal.timeout(300_000),
      });
      updateCookieJar(cookieJar, response.headers.getSetCookie(), target);

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) return response;
        const nextTarget = new URL(location, target);
        if (nextTarget.origin !== EKIN_ORIGIN) {
          throw new Error("Redirect E-Kinerja menuju host yang tidak diizinkan.");
        }
        if (
          response.status === 303 ||
          ((response.status === 301 || response.status === 302) &&
            currentMethod !== "GET" &&
            currentMethod !== "HEAD")
        ) {
          currentMethod = "GET";
          currentBody = undefined;
          currentHeaders = { "User-Agent": USER_AGENT };
        }
        target = nextTarget;
        continue;
      }
      return response;
    }
    throw new Error("Terlalu banyak redirect saat menghubungi E-Kinerja.");
  }

  async recognizeCaptchaWithTesseract(image) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bot-ekin-"));
    const imagePath = path.join(directory, "captcha.png");
    try {
      await writeFile(imagePath, image);
      const { stdout } = await execFileAsync(
        process.env.TESSERACT_PATH || "tesseract",
        [imagePath, "stdout", "-l", "eng", "--oem", "1", "--psm", "7"],
        { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 },
      );
      return stdout.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async login(username, password) {
    const cookieJar = [];
    const loginPageResponse = await this.request(
      `${EKIN_ORIGIN}/auth/login`,
      {},
      cookieJar,
    );
    if (!loginPageResponse.ok) {
      throw new Error("Gagal mengambil halaman login E-Kinerja.");
    }
    const loginPage = await loginPageResponse.text();
    const loginToken = extractToken(loginPage);
    const captchaUrl = extractCaptchaUrl(loginPage);
    if (!loginToken || !captchaUrl) {
      throw new Error("Token atau captcha E-Kinerja tidak tersedia.");
    }

    const captchaResponse = await this.request(captchaUrl, {}, cookieJar);
    if (!captchaResponse.ok) {
      throw new Error("Gagal mengambil captcha E-Kinerja.");
    }
    const captcha = await this.recognizeCaptcha(
      Buffer.from(await captchaResponse.arrayBuffer()),
    );
    if (!captcha) throw new Error("Captcha E-Kinerja tidak dapat dibaca.");

    const form = new URLSearchParams({
      _token: loginToken,
      act: "login",
      v_username: username,
      v_password: password,
      v_captcha: captcha,
    });
    const loginResponse = await this.request(
      `${EKIN_ORIGIN}/auth`,
      {
        method: "POST",
        headers: {
          Accept: "*/*",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Csrf-Token": loginToken,
          "X-Requested-With": "XMLHttpRequest",
          Origin: EKIN_ORIGIN,
          Referer: `${EKIN_ORIGIN}/auth/login`,
        },
        body: form,
      },
      cookieJar,
    );
    if (!loginResponse.ok) {
      throw new Error(`Login E-Kinerja gagal (HTTP ${loginResponse.status}).`);
    }

    const mainResponse = await this.request(
      `${EKIN_ORIGIN}/skp`,
      { headers: { "X-Csrf-Token": loginToken } },
      cookieJar,
    );
    if (!mainResponse.ok) {
      throw new Error("Gagal mengambil daftar SKP dari E-Kinerja.");
    }
    const skpPage = await mainResponse.text();
    const setCookies = cookieJar
      .filter((cookie) => cookieHeader([cookie], `${EKIN_ORIGIN}/skp/renaksi/`))
      .map(({ name, value }) => `${name}=${value}`);
    const xsrfCookie = cookieJar.find(
      (cookie) =>
        cookie.name.toLowerCase() === "xsrf-token" &&
        cookieHeader([cookie], `${EKIN_ORIGIN}/skp/renaksi/`),
    );
    const csrfToken = extractToken(skpPage) || loginToken;
    if (!setCookies.length || !csrfToken) {
      throw new Error("Cookie sesi atau token E-Kinerja tidak tersedia.");
    }

    return {
      cookieJar,
      allCookies: setCookies.join("; "),
      csrfToken,
      xsrfToken: xsrfCookie ? decodeURIComponent(xsrfCookie.value) : "",
      skpPage,
    };
  }

  async logout(session) {
    if (!session?.cookieJar?.length && !session?.allCookies) {
      return { status: 204 };
    }
    const response = await this.request(
      `${EKIN_ORIGIN}/logout`,
      {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Referer: `${EKIN_ORIGIN}/`,
          ...(session.csrfToken
            ? { "X-Csrf-Token": session.csrfToken }
            : {}),
        },
      },
      session.cookieJar || [],
    );
    return { status: response.status };
  }

  async getRenaksiPage(session, idSkp) {
    const response = await this.request(
      `${EKIN_ORIGIN}/skp/renaksi/${encodeURIComponent(idSkp)}`,
      {
        headers: session.xsrfToken
          ? { "X-Csrf-Token": session.xsrfToken }
          : {},
      },
      session.cookieJar,
    );
    if (!response.ok) return null;
    return response.text();
  }

  async postForm(session, url, fields, referer) {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value)) {
        value.forEach((item, index) => form.append(`${key}[${index}]`, item));
      } else {
        form.append(key, value == null ? "" : String(value));
      }
    }
    const response = await this.request(
      url,
      {
        method: "POST",
        headers: {
          Accept: "*/*",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Csrf-Token": session.csrfToken,
          "X-Requested-With": "XMLHttpRequest",
          Origin: EKIN_ORIGIN,
          Referer: referer,
        },
        body: form,
      },
      session.cookieJar,
    );
    return { status: response.status, body: await response.text() };
  }

  async logoutAfterSubmit(session) {
    const response = await this.request(
      `${EKIN_ORIGIN}/logout`,
      {
        headers: {
          Accept: "*/*",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${EKIN_ORIGIN}/`,
        },
      },
      session.cookieJar,
    );
    return { status: response.status, body: await response.text() };
  }
}

export function extractMappingSource(page) {
  const arrays = ["penilaiaan", "penilaiaan_indikator", "rkh_indikator"]
    .map((name) => extractPageArraySource(page, name))
    .filter(Boolean);
  const objects = ["skp", "pegawai"]
    .map((name) => extractPageObjectSource(page, name))
    .filter(Boolean);
  return [...arrays, ...objects].join("\n");
}

export { extractPageArraySource };
