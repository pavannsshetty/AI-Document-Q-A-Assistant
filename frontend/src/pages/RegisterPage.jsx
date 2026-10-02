import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { extractApiErrorMessage } from '../services/api.js';
import { AuthLayout } from '../layouts/AuthLayout.jsx';
import { Input } from '../components/Input.jsx';
import { Button } from '../components/Button.jsx';
import { ErrorMessage } from '../components/ErrorMessage.jsx';

export const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading || submittingRef.current) {
      return;
    }
    setError('');

    const trimmedName = name.trim().replace(/\s+/g, ' ');
    const normalizedEmail = email.trim().toLowerCase();

    if (trimmedName.length < 2) {
      setError('Name must be at least 2 characters long.');
      return;
    }

    if (trimmedName.length > 80) {
      setError('Name cannot exceed 80 characters.');
      return;
    }

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      submittingRef.current = true;
      setLoading(true);
      const result = await register({
        name: trimmedName,
        email: normalizedEmail,
        password
      });
      if (result?.token && result?.user) {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setError(
        extractApiErrorMessage(err, 'Registration failed. Please try again.')
      );
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up your local RAG document workspace."
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <ErrorMessage message={error} onDismiss={() => setError('')} />

        <Input
          id="register-name"
          label="Name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Alex Morgan"
          required
          autoComplete="name"
          disabled={loading}
        />

        <Input
          id="register-email"
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
          id="register-password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          required
          autoComplete="new-password"
          disabled={loading}
        />

        <Input
          id="register-confirm-password"
          label="Confirm Password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter your password"
          required
          autoComplete="new-password"
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
            Create Account
          </Button>
        </div>

        <p className="text-center text-sm text-slate-600 dark:text-slate-400 pt-2">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-[#0AAF29] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
};

export default RegisterPage;
