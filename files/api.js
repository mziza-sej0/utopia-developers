/**
 * js/api.js — Frontend API client for Utopia Developers
 * Include this BEFORE page-specific scripts: <script src="js/api.js"></script>
 *
 * Exposes: window.UtopiaAPI
 */
(function () {
  'use strict';

  const BASE_URL = 'http://localhost:3000/api';
  const TOKEN_KEY = 'utopia_token';

  // ─── Token helpers ──────────────────────────────────────────────────────────

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  // ─── Core fetch wrapper ─────────────────────────────────────────────────────

  async function apiFetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await res.json();

    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  // ─── Auth module ────────────────────────────────────────────────────────────

  const Auth = {
    async register(name, email, password) {
      const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: { name, email, password },
      });
      setToken(data.token);
      return data;
    },

    async login(email, password, remember = false) {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: { email, password, remember },
      });
      setToken(data.token);
      return data;
    },

    async loginWithGoogle(googleToken) {
      const data = await apiFetch('/auth/google', {
        method: 'POST',
        body: { token: googleToken },
      });
      setToken(data.token);
      return data;
    },

    async forgotPassword(email) {
      return apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: { email },
      });
    },

    async resetPassword(token, password) {
      return apiFetch('/auth/reset-password', {
        method: 'POST',
        body: { token, password },
      });
    },

    async getCurrentUser() {
      return apiFetch('/auth/me');
    },

    async logout() {
      try {
        await apiFetch('/auth/logout', { method: 'POST' });
      } finally {
        clearToken();
      }
    },

    isLoggedIn() {
      return !!getToken();
    },

    getStoredToken() {
      return getToken();
    },
  };

  // ─── Contact module ─────────────────────────────────────────────────────────

  const Contact = {
    async send({ name, email, subject, message, subscribe }) {
      return apiFetch('/contact', {
        method: 'POST',
        body: { name, email, subject, message, subscribe },
      });
    },
  };

  // ─── Notification helper ────────────────────────────────────────────────────

  function showNotification(message, type = 'info') {
    // Remove any existing notification
    const old = document.getElementById('utopia-notification');
    if (old) old.remove();

    const el = document.createElement('div');
    el.id = 'utopia-notification';
    el.textContent = message;

    const colors = {
      success: '#22c55e',
      error: '#ef4444',
      info: '#1f9cf0',
      warning: '#f59e0b',
    };

    Object.assign(el.style, {
      position: 'fixed',
      top: '1.25rem',
      right: '1.25rem',
      background: colors[type] || colors.info,
      color: '#fff',
      padding: '0.75rem 1.25rem',
      borderRadius: '8px',
      fontFamily: 'sans-serif',
      fontSize: '0.95rem',
      fontWeight: '600',
      zIndex: '9999',
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      animation: 'fadeInDown 0.25s ease',
      maxWidth: '360px',
    });

    // Inject keyframe if not present
    if (!document.getElementById('utopia-notif-style')) {
      const style = document.createElement('style');
      style.id = 'utopia-notif-style';
      style.textContent = `
        @keyframes fadeInDown {
          from { opacity:0; transform:translateY(-10px) }
          to   { opacity:1; transform:translateY(0) }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  // ─── Expose globally ────────────────────────────────────────────────────────

  window.UtopiaAPI = { Auth, Contact, showNotification };
})();
