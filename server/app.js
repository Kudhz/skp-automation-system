import crypto from "node:crypto";
import express from "express";
import session from "express-session";
import multer from "multer";
import process from "node:process";
import { EkinClient, extractMappingSource, extractPageArraySource } from "./ekinClient.js";

const API_PREFIX = "/api";
const SESSION_DURATION = 2 * 60 * 60 * 1000;
const EKIN_ORIGIN = "https://e-kinerja.kemenhub.go.id";
const ACTION_URLS = {
  tambah: `${EKIN_ORIGIN}/skp/renaksi/add`,
  isi: `${EKIN_ORIGIN}/skp/renaksi/editdetailitem`,
  ajukan: `${EKIN_ORIGIN}/skp/renaksi/pengajuan`,
};
const SESSION_KEYS = [
  "allCookies",
  "cookieJar",
  "csrfToken",
  "xsrfToken",
  "ekinUsername",
  "idSkp",
  "mappingPending",
];

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalizedKey(value) {
  return String(value).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

export function resolveAccountPassword({ unit, category, username }, environment) {
  const unitKey = normalizedKey(unit);
  const categoryKey = normalizedKey(category);
  const prefixes = [
    `VITE_USER_${unitKey}_${categoryKey}_`,
    `BOT_USER_${unitKey}_${categoryKey}_`,
  ];
  const passwords = new Set();

  for (const [key, value] of Object.entries(environment)) {
    const prefix = prefixes.find(
      (candidate) =>
        key.startsWith(candidate) && key.endsWith("_USERNAME"),
    );
    if (!prefix || value !== username) continue;

    const accountName = key.slice(prefix.length, -"_USERNAME".length);
    for (const passwordPrefix of prefixes) {
      const password = environment[`${passwordPrefix}${accountName}_PASSWORD`];
      if (password) passwords.add(password);
    }
  }
  return passwords.size === 1 ? [...passwords][0] : null;
}

function clearEkinSession(req) {
  for (const key of SESSION_KEYS) delete req.session[key];
}

function jsonResponse(res, status, payload) {
  res.set("Cache-Control", "no-store");
  return res.status(status).json(payload);
}

function requestObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function requireString(value, message) {
  if (typeof value !== "string" || !value) {
    throw new ApiError(400, message);
  }
  return value;
}

function validPending(req, body) {
  const pending = req.session.mappingPending;
  return (
    pending &&
    typeof body.nonce === "string" &&
    pending.nonce === body.nonce &&
    req.session.ekinUsername === body.username
  );
}

function skpIdExists(source, id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `"id"\\s*:\\s*(?:"${escapedId}"|${escapedId})(?=\\s*[,}])`,
    "i",
  ).test(source);
}

function requireEkinSession(req, username) {
  if (
    typeof username !== "string" ||
    !username ||
    req.session.ekinUsername !== username ||
    typeof req.session.allCookies !== "string" ||
    !req.session.allCookies ||
    typeof req.session.csrfToken !== "string" ||
    !req.session.csrfToken ||
    !req.session.idSkp ||
    req.session.mappingPending
  ) {
    throw new ApiError(
      409,
      "Sesi E-Kinerja tidak tersedia. Pilih pengguna dan muat ulang data.",
    );
  }
  return req.session;
}

function formValue(body, key, fallback = "") {
  const value = body[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value == null ? fallback : String(value);
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Keep compatibility with the legacy comma-separated form values.
  }
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isSuccessfulRemoteBody(body) {
  try {
    return JSON.parse(body)?.status === true;
  } catch {
    return false;
  }
}

function createCorsMiddleware(environment) {
  const configured = (environment.NODE_API_CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = new Set(
    configured.length
      ? configured
      : ["http://localhost:5173", "http://127.0.0.1:5173"],
  );

  return (req, res, next) => {
    const origin = req.get("Origin");
    res.vary("Origin");
    if (origin && (allowedOrigins.has("*") || allowedOrigins.has(origin))) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Credentials", "true");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    } else if (origin) {
      return res.status(403).end();
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  };
}

export function createApiApp({
  ekinClient = new EkinClient(),
  environment = process.env,
} = {}) {
  const app = express();
  const upload = multer({ limits: { fieldSize: 1024 * 1024, fields: 30 } });
  const sessionSecret =
    environment.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
  if (environment.NODE_ENV === "production" && !environment.SESSION_SECRET) {
    throw new Error("SESSION_SECRET wajib disetel pada production.");
  }

  app.disable("x-powered-by");
  if (environment.TRUST_PROXY === "true") app.set("trust proxy", 1);
  app.use(createCorsMiddleware(environment));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(
    session({
      name: "node-api.sid",
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure:
          environment.COOKIE_SECURE === "true" ||
          (environment.NODE_ENV === "production" &&
            environment.COOKIE_SECURE !== "false"),
        maxAge: SESSION_DURATION,
        path: "/",
      },
    }),
  );

  app.get(`${API_PREFIX}/health`, (_req, res) =>
    jsonResponse(res, 200, { success: true, backend: "node" }),
  );

  app.get(`${API_PREFIX}/get_mapping`, (_req, res) =>
    jsonResponse(res, 405, {
      success: false,
      message: "Gunakan metode POST untuk memuat mapping.",
    }),
  );

  app.post(`${API_PREFIX}/get_mapping`, async (req, res, next) => {
    try {
      const body = requestObject(req.body);
      const stage = body.stage ?? "login";
      const username = requireString(
        body.username,
        "Permintaan mapping tidak valid.",
      );

      if (stage === "login") {
        const unit = requireString(
          body.unit,
          "Permintaan mapping tidak valid.",
        );
        const category = requireString(
          body.category,
          "Permintaan mapping tidak valid.",
        );
        const password = resolveAccountPassword(
          { unit, category, username },
          environment,
        );
        if (!password) {
          throw new ApiError(
            403,
            "Kredensial pengguna belum dikonfigurasi pada server.",
          );
        }

        if (req.session.ekinUsername) {
          if (!req.session.allCookies) {
            throw new ApiError(
              502,
              "Cookie sesi E-Kinerja sebelumnya tidak tersedia.",
            );
          }
          let logout;
          try {
            logout = await ekinClient.logout(req.session);
          } catch {
            throw new ApiError(
              502,
              "Gagal logout pengguna E-Kinerja sebelumnya. Silakan coba lagi.",
            );
          }
          if (logout.status !== 500 && (logout.status < 200 || logout.status >= 400)) {
            throw new ApiError(
              502,
              "Gagal logout pengguna E-Kinerja sebelumnya. Silakan coba lagi.",
            );
          }
        }
        clearEkinSession(req);

        let login;
        try {
          login = await ekinClient.login(username, password);
        } catch (error) {
          throw new ApiError(502, error.message || "Gagal login ke E-Kinerja.");
        }
        if (
          !login?.cookieJar?.length ||
          !login.allCookies ||
          !login.csrfToken ||
          typeof login.skpPage !== "string"
        ) {
          throw new ApiError(502, "Halaman SKP atau token sesi tidak tersedia.");
        }

        req.session.allCookies = login.allCookies;
        req.session.cookieJar = login.cookieJar;
        req.session.csrfToken = login.csrfToken;
        req.session.xsrfToken = login.xsrfToken || "";
        req.session.ekinUsername = username;
        const source = extractPageArraySource(login.skpPage, "dataList");
        if (!source) {
          throw new ApiError(502, "Halaman SKP atau token sesi tidak tersedia.");
        }

        const nonce = crypto.randomBytes(32).toString("hex");
        req.session.mappingPending = {
          nonce,
          source,
          xsrfToken: login.xsrfToken || "",
        };
        const today = new Date();
        const currentDate = today.toISOString().slice(0, 10);
        return jsonResponse(res, 200, {
          success: true,
          skp_source: source,
          year: today.getUTCFullYear(),
          current_date: currentDate,
          nonce,
        });
      }

      if (stage === "refresh") {
        const activeSession = requireEkinSession(req, username);
        let page;
        try {
          page = await ekinClient.getRenaksiPage(activeSession, activeSession.idSkp);
        } catch (error) {
          throw new ApiError(502, error.message || "Gagal mengambil halaman rencana aksi.");
        }
        if (typeof page !== "string" || !page) {
          throw new ApiError(502, "Gagal mengambil halaman rencana aksi.");
        }
        return jsonResponse(res, 200, {
          success: true,
          raw_response: extractMappingSource(page),
        });
      }

      if (!validPending(req, { ...body, username })) {
        throw new ApiError(
          409,
          "Sesi mapping berubah. Pilih pengguna dan muat ulang data.",
        );
      }

      const pending = req.session.mappingPending;
      if (stage === "renaksi") {
        delete req.session.mappingPending.idSkp;
        const idSkp = body.id_skp;
        if (
          typeof idSkp !== "string" ||
          !/^[1-9][0-9]{0,15}$/.test(idSkp) ||
          !skpIdExists(pending.source, idSkp)
        ) {
          throw new ApiError(400, "ID SKP tidak valid untuk sesi ini.");
        }

        let page;
        try {
          page = await ekinClient.getRenaksiPage(
            {
              cookieJar: req.session.cookieJar,
              allCookies: req.session.allCookies,
              csrfToken: req.session.csrfToken,
              xsrfToken: pending.xsrfToken,
            },
            idSkp,
          );
        } catch (error) {
          throw new ApiError(502, error.message || "Gagal mengambil halaman rencana aksi.");
        }
        if (typeof page !== "string" || !page) {
          throw new ApiError(502, "Gagal mengambil halaman rencana aksi.");
        }
        req.session.mappingPending.idSkp = idSkp;
        return jsonResponse(res, 200, {
          success: true,
          raw_response: extractMappingSource(page),
        });
      }

      if (stage === "complete" && pending.idSkp) {
        req.session.idSkp = pending.idSkp;
        delete req.session.mappingPending;
        return jsonResponse(res, 200, { success: true });
      }

      throw new ApiError(400, "Tahap mapping tidak valid.");
    } catch (error) {
      next(error);
    }
  });

  app.post(`${API_PREFIX}/tambakrenaksi`, async (req, res, next) => {
    try {
      const activeSession = requireEkinSession(
        req,
        formValue(req.body, "username"),
      );
      const tupoksi = parseArray(formValue(req.body, "tupoksi", "[]"));
      const bulan = Number.parseInt(formValue(req.body, "bulan", "10"), 10);
      const idSkp = Number.parseInt(String(activeSession.idSkp), 10);
      const payload = {
        id_penilaiaan: "",
        id_indikator_penilaiaan: tupoksi,
        bulan: Number.isFinite(bulan) ? bulan : 10,
        tahun: new Date().getFullYear(),
        id_skp: idSkp,
      };
      let result;
      try {
        result = await ekinClient.postForm(
          activeSession,
          ACTION_URLS.tambah,
          payload,
          `${EKIN_ORIGIN}/skp/renaksi/${idSkp}`,
        );
      } catch (error) {
        throw new ApiError(
          502,
          error.message || "Gagal menambahkan rencana aksi.",
        );
      }
      if (result.status < 200 || result.status >= 400) {
        throw new ApiError(502, `Gagal menambahkan rencana aksi (HTTP ${result.status}).`);
      }
      return jsonResponse(res, 200, {
        status: "success",
        sent_payload: payload,
        remote_response: result.body,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    `${API_PREFIX}/ekinprocess`,
    upload.none(),
    async (req, res, next) => {
      try {
        const body = requestObject(req.body);
        const activeSession = requireEkinSession(
          req,
          formValue(body, "username"),
        );
        const ids = parseArray(formValue(body, "id_indikator"));
        let plans;
        try {
          plans = JSON.parse(formValue(body, "rhk"));
        } catch {
          throw new ApiError(400, "Data RHK tidak valid.");
        }
        if (
          !Array.isArray(plans) ||
          plans.length === 0 ||
          plans.length > 500 ||
          plans.some((value) => typeof value !== "string") ||
          ids.length !== plans.length ||
          ids.some((id) => !["string", "number"].includes(typeof id) || !String(id).trim())
        ) {
          throw new ApiError(400, "Jumlah RHK dan ID indikator harus sama dan tidak boleh kosong.");
        }
        const evidence = formValue(body, "bukti_dukung");
        const total = plans.length;
        const realValues = ["1 Document", "100 Persen", "1 Bulan"];
        const payloads = [];

        for (let index = 0; index < total; index += 1) {
          const id = String(ids[index]).trim();
          const value = plans[index];
          payloads.push(
            { id, key: "renaksi", value },
            {
              id,
              key: "realisasi",
              value: realValues[index % realValues.length],
            },
            { id, key: "bukti_dukung", value: evidence },
          );
        }

        const sendPayload = (payload) =>
          ekinClient.postForm(
            activeSession,
            ACTION_URLS.isi,
            payload,
            `${EKIN_ORIGIN}/skp/renaksi/${activeSession.idSkp}`,
          );
        const execute = async (items) =>
          Promise.all(
            items.map(async (item) => {
              try {
                const result = await sendPayload(item.payload);
                return {
                  ...item,
                  result,
                  success:
                    result.status >= 200 &&
                    result.status < 300 &&
                    isSuccessfulRemoteBody(result.body),
                  retryable: result.status === 0 || result.status >= 500,
                };
              } catch (error) {
                return { ...item, error: error.message, success: false, retryable: true };
              }
            }),
          );

        const responses = await execute(payloads.map((payload, index) => ({ index, payload })));
        const finalResults = [...responses];
        let retryPayloads = responses.filter((response) => !response.success && response.retryable)
          .map(({ index, payload }) => ({ index, payload }));
        const retryResults = [];
        for (let attempt = 1; retryPayloads.length && attempt <= 5; attempt += 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 2 ** attempt * 100 + Math.floor(Math.random() * 200)),
          );
          const result = await execute(retryPayloads);
          for (const item of result) finalResults[item.index] = item;
          retryResults.push(
            ...result.map(({ result: response, error, payload, success }) => ({
              attempt,
              http_code: response?.status || 0,
              err: error || "",
              payload,
              body: response?.body || "",
              success,
            })),
          );
          retryPayloads = result
            .filter((response) => !response.success && response.retryable)
            .map(({ index, payload }) => ({ index, payload }));
        }

        const initialSuccessCount = responses.filter((response) => response.success).length;
        const successCount = finalResults.filter((response) => response.success).length;
        const retrySuccessCount = successCount - initialSuccessCount;
        const retriedCount = responses.filter((response) => !response.success && response.retryable).length;
        const expectedCount = total * 3;
        const success = successCount === expectedCount;
        return jsonResponse(res, success ? 200 : 207, {
          status: success ? "success" : "partial",
          count: responses.length,
          expected_count: expectedCount,
          initial_success_count: initialSuccessCount,
          success_count: successCount,
          retry_success_count: retrySuccessCount,
          retry_failure_count: retriedCount - retrySuccessCount,
          retries: retryResults.length,
          retry_summary: retryResults,
          final_failures: finalResults
            .filter((response) => !response.success)
            .map(({ result, error, payload }) => ({
              http_code: result?.status || 0,
              err: error || "",
              payload,
            })),
          final_success: successCount,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(`${API_PREFIX}/ajukan`, async (req, res, next) => {
    try {
      const activeSession = requireEkinSession(
        req,
        formValue(req.body, "username"),
      );
      const tupoksi = parseArray(formValue(req.body, "tupoksi"));
      const idSkp = Number.parseInt(String(activeSession.idSkp), 10);
      const payload = { id_penilaiaan: tupoksi };
      let remote;
      try {
        remote = await ekinClient.postForm(
          activeSession,
          ACTION_URLS.ajukan,
          payload,
          `${EKIN_ORIGIN}/skp/renaksi/${idSkp}`,
        );
      } catch (error) {
        throw new ApiError(502, error.message || "Gagal mengajukan rencana aksi.");
      }

      if (remote.status < 200 || remote.status >= 400) {
        throw new ApiError(502, `Pengajuan gagal (HTTP ${remote.status}).`);
      }
      return jsonResponse(res, 200, {
        status: "success",
        sent_payload: payload,
        remote_response: remote.body,
      });
    } catch (error) {
      next(error);
    }
  });

  const logoutHandler = async (req, res, next) => {
    try {
      if (req.session.ekinUsername) {
        let result;
        try {
          result = await ekinClient.logout(req.session);
        } catch {
          throw new ApiError(502, "Gagal logout pengguna E-Kinerja.");
        }
        if (result.status !== 500 && (result.status < 200 || result.status >= 400)) {
          throw new ApiError(502, "Gagal logout pengguna E-Kinerja.");
        }
      }
      clearEkinSession(req);
      return jsonResponse(res, 200, { success: true });
    } catch (error) {
      next(error);
    }
  };
  app.post(`${API_PREFIX}/logout`, logoutHandler);

  app.use((_req, res) =>
    jsonResponse(res, 404, { success: false, message: "Endpoint tidak ditemukan." }),
  );
  app.use((error, _req, res, _next) => {
    void _next;
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status === 500) console.error("Node API error:", error);
    return jsonResponse(res, status, {
      success: false,
      message:
        status === 500
          ? "Terjadi kesalahan pada server Node API."
          : error.message,
    });
  });

  return app;
}
