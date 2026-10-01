import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { extractApiErrorMessage } from '../services/api.js';
import { AuthLayout } from '../layouts/AuthLayout.jsx';
import { Input } from '../components/Input.jsx';
import { Button } from '../components/Button.jsx';
import { ErrorMessage } from '../components/ErrorMessage.jsx';

export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    try {
      setLoading(true);
      await login({ email: trimmedEmail, password });
      navigate('/dashboard');
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Login failed. Check your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in to your workspace"
      subtitle="Upload PDF, DOCX, and TXT documents and ask questions with local RAG."
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <ErrorMessage message={error} onDismiss={() => setError('')} />

        <Input
          id="login-email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
          disabled={loading}
        />

        <Input
          id="login-password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
          autoComplete="current-password"
          disabled={loading}
        />

        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            className="w-full"
          >
            Sign In
          </Button>
        </div>

        <p className="text-center text-sm text-slate-600 dark:text-slate-400 pt-2">
          Don&apos;t have an account?{' '}
          <Link
            to="/register"
            className="font-semibold text-[#0AAF29] hover:underline"
          >
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
};

export default LoginPage;
