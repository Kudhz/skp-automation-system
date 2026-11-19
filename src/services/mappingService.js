import { API_CREDENTIALS, API_ENDPOINTS } from "../config/api.js";
import { getActiveSkp, validateRenaksiPage } from "../utils/skpPage.js";

const CACHE_DURATION = 60 * 1000;
const mappingCache = new Map();
const mappingRequests = new Map();
const pendingMappings = new Set();
let activeMapping = null;
let sessionGeneration = 0;
let mappingQueue = Promise.resolve();
let latestRequestedKey = "";

async function requestMapping(body) {
  const response = await fetch(API_ENDPOINTS.GET_MAPPING, {
    method: "POST",
    credentials: API_CREDENTIALS,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Server mengirim respons mapping yang tidak valid.");
  }
  if (!response.ok || result?.success !== true) {
    throw new Error(
      result?.message || `Gagal mengambil mapping (HTTP ${response.status}).`,
    );
  }
  return result;
}

export async function fetchUserMapping({ unit, category, username }) {
  const cacheKey = `${unit}\u0000${category}\u0000${username}`;
  const pendingRequest = mappingRequests.get(cacheKey);
  if (pendingRequest && !pendingRequest.invalidated && latestRequestedKey === cacheKey) {
    return pendingRequest.promise;
  }
  latestRequestedKey = cacheKey;

  const requestEntry = { username, invalidated: false, generation: sessionGeneration, promise: null };
  const request = mappingQueue.then(async () => {
    const cached = mappingCache.get(cacheKey);
    if (
      !requestEntry.invalidated &&
      cached &&
      cached.expiresAt > Date.now() &&
      activeMapping?.key === cacheKey
    ) {
      return cached.result;
    }

    if (activeMapping?.key === cacheKey) {
      const previousMapping = activeMapping.result;
      const page = await requestMapping({ stage: "refresh", username });
      validateRenaksiPage(page.raw_response);
      const result = { ...previousMapping, raw_response: page.raw_response };
      if (requestEntry.generation === sessionGeneration) {
        activeMapping = { key: cacheKey, result };
      }
      if (!requestEntry.invalidated) {
        mappingCache.set(cacheKey, {
          expiresAt: Date.now() + CACHE_DURATION,
          result,
          username,
        });
      }
      return result;
    }

    activeMapping = null;
    const login = await requestMapping({ stage: "login", unit, category, username });
    if (!Number.isInteger(login.year) || typeof login.nonce !== "string" || !login.nonce ||
        typeof login.current_date !== "string" || Number(login.current_date.slice(0, 4)) !== login.year) {
      throw new Error("Respons halaman SKP tidak valid.");
    }
    const { id, startDate, endDate } = getActiveSkp(login.skp_source, login.current_date);
    const page = await requestMapping({
      stage: "renaksi",
      username,
      nonce: login.nonce,
      id_skp: id,
    });
    validateRenaksiPage(page.raw_response);
    await requestMapping({ stage: "complete", username, nonce: login.nonce });

    const result = {
      success: true,
      id_skp: id,
      raw_response: page.raw_response,
      year: login.year,
      period: { startDate, endDate },
    };

    if (requestEntry.generation === sessionGeneration) {
      activeMapping = { key: cacheKey, result };
    }
    if (!requestEntry.invalidated) {
      mappingCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_DURATION,
        result,
        username,
      });
    }
    return result;
  });

  requestEntry.promise = request;
  mappingRequests.set(cacheKey, requestEntry);
  pendingMappings.add(requestEntry);
  mappingQueue = request.then(
    () => undefined,
    () => undefined,
  );
  const clearPendingRequest = () => {
    pendingMappings.delete(requestEntry);
    if (mappingRequests.get(cacheKey) === requestEntry) {
      mappingRequests.delete(cacheKey);
    }
  };
  request.then(clearPendingRequest, clearPendingRequest);
  return request;
}

export function clearUserMappingCache(username) {
  if (!username) {
    sessionGeneration += 1;
    activeMapping = null;
  }
  for (const entry of pendingMappings) {
    if (!username || entry.username === username) {
      entry.invalidated = true;
    }
  }
  for (const [key, entry] of mappingCache) {
    if (!username || entry.username === username) {
      mappingCache.delete(key);
    }
  }
}
