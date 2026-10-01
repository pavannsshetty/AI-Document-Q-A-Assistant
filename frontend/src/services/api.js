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

const apiBaseUrl = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: apiBaseUrl,
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
  (error) => {
    const status = error.response?.status;
    const requestUrl = String(error.config?.url || '');
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
