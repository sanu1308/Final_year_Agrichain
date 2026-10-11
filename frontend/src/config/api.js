function getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  }

  // Dynamic origin detection for development and LAN testing:
  // Connects to port 5000 on whatever host the page was loaded from (localhost or any Wi-Fi IP)
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:5000/api/v1`;
  }

  return 'http://localhost:5000/api/v1';
}

export const API_BASE_URL = getApiBaseUrl();

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('agrichain_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || 'API request failed');
  }

  return data;
}
