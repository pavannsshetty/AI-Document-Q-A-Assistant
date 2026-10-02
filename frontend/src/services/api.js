import axios from 'axios';

const TOKEN_STORAGE_KEY = 'ai_doc_qa_token';
const USER_STORAGE_KEY = 'ai_doc_qa_user';

export const getStoredToken = () => localStorage.getItem(TOKEN_STORAGE_KEY);

export const setStoredAuth = (token, user) => {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }
};

export const clearStoredAuth = () => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
};

export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const resolveApiBaseUrl = () => {
  const rawEnvUrl = String(import.meta.env.VITE_API_URL || '').trim();
  if (!rawEnvUrl || rawEnvUrl.startsWith('MY_')) {
    return '/api';
  }

  if (typeof window !== 'undefined') {
    const { hostname, port } = window.location;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (!isLocalhost && (rawEnvUrl.includes('localhost') || rawEnvUrl.includes('127.0.0.1'))) {
      return '/api';
    }

    if (isLocalhost && port !== '5173' && rawEnvUrl.includes('localhost:5000')) {
      return '/api';
    }
  }

  return rawEnvUrl;
};

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 180000
});

api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalConfig = error.config;
    if (
      originalConfig &&
      !error.response &&
      !originalConfig._retriedWithRelativeApi &&
      originalConfig.baseURL !== '/api'
    ) {
      originalConfig._retriedWithRelativeApi = true;
      originalConfig.baseURL = '/api';
      api.defaults.baseURL = '/api';
      return api.request(originalConfig);
    }

    const status = error.response?.status;
    const requestUrl = String(originalConfig?.url || '');
    const isAuthAttempt =
      requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');

    if (status === 401 && !isAuthAttempt) {
      clearStoredAuth();
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      if (
        typeof window !== 'undefined' &&
        window.location.pathname !== '/login' &&
        window.location.pathname !== '/register'
      ) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export const extractApiErrorMessage = (error, fallback = 'An unexpected error occurred.') => {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  if (error?.code === 'ERR_NETWORK') {
    return 'Unable to connect to the backend server. Ensure the backend is running.';
  }
  if (error?.message) {
    return error.message;
  }
  return fallback;
};

export const authApi = {
  register: async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    return data;
  },
  login: async (payload) => {
    const { data } = await api.post('/auth/login', payload);
    return data;
  },
  getMe: async () => {
    const { data } = await api.get('/auth/me');
    return data;
  }
};

export const documentApi = {
  upload: async (file, options = {}) => {
    const formData = new FormData();
    formData.append('document', file);
    const onUploadProgress =
      typeof options === 'function' ? options : options?.onUploadProgress;
    const uploadId =
      typeof options === 'object' && options !== null ? options.uploadId : null;

    const headers = { 'Content-Type': 'multipart/form-data' };
    if (uploadId) {
      headers['X-Upload-Id'] = String(uploadId);
    }

    const { data } = await api.post('/documents/upload', formData, {
      headers,
      onUploadProgress
    });
    return data;
  },
  getUploadProgress: async (uploadId) => {
    const { data } = await api.get(
      `/documents/upload-progress/${encodeURIComponent(uploadId)}`
    );
    return data;
  },
  list: async (search = '') => {
    const params = search ? { search } : {};
    const { data } = await api.get('/documents', { params });
    return data;
  },
  getById: async (id) => {
    const { data } = await api.get(`/documents/${id}`);
    return data;
  },
  reindex: async (id) => {
    const { data } = await api.post(`/documents/${id}/reindex`);
    return data;
  },
  reindexAll: async () => {
    const { data } = await api.post('/documents/reindex-all');
    return data;
  },
  remove: async (id) => {
    const { data } = await api.delete(`/documents/${id}`);
    return data;
  }
};

export const chatApi = {
  askQuestion: async ({ documentId, conversationId, question }) => {
    const { data } = await api.post('/chat', {
      documentId,
      conversationId,
      question
    });
    return data;
  },
  createConversation: async ({ documentId, title }) => {
    const { data } = await api.post('/chat/conversations', {
      documentId,
      title
    });
    return data;
  },
  listConversations: async (documentId = '') => {
    const params = documentId ? { documentId } : {};
    const { data } = await api.get('/chat/conversations', { params });
    return data;
  },
  getConversation: async (conversationId) => {
    const { data } = await api.get(`/chat/conversations/${conversationId}`);
    return data;
  },
  deleteConversation: async (conversationId) => {
    const { data } = await api.delete(`/chat/conversations/${conversationId}`);
    return data;
  }
};

export default api;
