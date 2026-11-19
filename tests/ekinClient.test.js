import { strict as assert } from "node:assert";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import { EkinClient } from "../server/ekinClient.js";

test("login keeps cookies through captcha and follows only E-Kinerja redirects", async () => {
  const calls = [];
  const client = new EkinClient({
    recognizeCaptcha: async (image) => {
      assert.deepEqual(image, Buffer.from("captcha-image"));
      return "AB12";
    },
    fetchImpl: async (url, options) => {
      const target = new URL(url);
      calls.push({
        path: target.pathname,
        method: options.method,
        cookie: options.headers.Cookie || "",
      });

      if (target.pathname === "/auth/login") {
        return new Response(
          '<input type="hidden" name="_token" value="login-token"><div class="input-group div-img-captcha mt-2"><img src="/captcha.png"></div>',
          {
            headers: {
              "Set-Cookie": "prelogin=one; Path=/; HttpOnly",
            },
          },
        );
      }
      if (target.pathname === "/captcha.png") {
        return new Response("captcha-image", { status: 200 });
      }
      if (target.pathname === "/auth" && options.method === "POST") {
        assert.match(options.headers.Cookie, /prelogin=one/);
        assert.equal(
          new URLSearchParams(options.body).get("v_captcha"),
          "AB12",
        );
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/skp",
            "Set-Cookie": "laravel_session=session-value; Path=/; HttpOnly",
          },
        });
      }
      if (target.pathname === "/skp") {
        return new Response(
          'var dataList = [{"id":123}];',
          {
            headers: {
              "Set-Cookie": "XSRF-TOKEN=csrf%3Dtoken; Path=/; Secure",
            },
          },
        );
      }
      throw new Error(`Unexpected request: ${options.method} ${target.pathname}`);
    },
  });

  const result = await client.login("operator", "private-password");
  assert.match(result.allCookies, /prelogin=one/);
  assert.match(result.allCookies, /laravel_session=session-value/);
  assert.equal(result.xsrfToken, "csrf=token");
  assert.equal(result.csrfToken, "login-token");
  assert.match(result.skpPage, /dataList/);
  assert.equal(
    calls.filter((call) => call.path === "/skp").length,
    2,
  );
  assert.equal(calls.find((call) => call.path === "/captcha.png").cookie, "prelogin=one");
});

test("remote requests reject redirects to a different origin", async () => {
  const client = new EkinClient({
    fetchImpl: async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://example.test/collect" },
      }),
  });
  await assert.rejects(
    client.request("https://e-kinerja.kemenhub.go.id/auth/login"),
    /host yang tidak diizinkan/,
  );
});
