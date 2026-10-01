import React, { useState } from 'react';
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (trimmedName.length < 2) {
      setError('Name must be at least 2 characters long.');
      return;
    }

    if (!trimmedEmail || !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
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
      setLoading(true);
      await register({
        name: trimmedName,
        email: trimmedEmail,
        password
      });
      navigate('/dashboard');
    } catch (err) {
      setError(
        extractApiErrorMessage(err, 'Registration failed. Please try again.')
      );
    } finally {
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
