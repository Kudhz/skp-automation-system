const frontendEnvironment = import.meta.env || {};

export function createApiConfig(environment = frontendEnvironment) {
  const backend = (environment.VITE_API_BACKEND || "php").toLowerCase();
  if (backend !== "php" && backend !== "node") {
    throw new Error('VITE_API_BACKEND harus bernilai "php" atau "node".');
  }

  const baseUrl =
    backend === "node"
      ? (environment.VITE_NODE_API_BASE_URL || "/api").replace(/\/+$/, "")
      : "";
  const endpoint = (phpPath) =>
    backend === "node"
      ? `${baseUrl}/${phpPath.replace(/\.php$/i, "").replace(/^\/+/, "")}`
      : `/${phpPath.replace(/^\/+/, "")}`;

  return {
    backend,
    credentials: backend === "node" ? "include" : "same-origin",
    endpoints: {
      GET_MAPPING: endpoint("get_mapping.php"),
      TAMBAH_RENAKSI: endpoint("tambakrenaksi.php"),
      ISI_RENAKSI: endpoint("ekinprocess.php"),
      AJUKAN_RENAKSI: endpoint("ajukan.php"),
      LOGOUT: backend === "node" ? endpoint("logout") : null,
    },
  };
}

const apiConfig = createApiConfig();
export const API_BACKEND = apiConfig.backend;
export const API_CREDENTIALS = apiConfig.credentials;
export const API_ENDPOINTS = apiConfig.endpoints;

// Helper function untuk membuat URL endpoint
export const getEndpoint = (endpoint) => {
  return API_ENDPOINTS[endpoint] || endpoint;
};
