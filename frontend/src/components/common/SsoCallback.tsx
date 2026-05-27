import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { completeSsoLogin } from '@/services/auth';
import { Shield } from 'lucide-react';

export function SsoCallback() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (errorParam) {
      setError(errorDescription || errorParam);
      return;
    }

    if (!code || !state) {
      setError('Missing authorization code or state parameter');
      return;
    }

    const savedState = sessionStorage.getItem('sso_state');
    if (state !== savedState) {
      setError('Invalid state parameter. Please try signing in again.');
      return;
    }

    sessionStorage.removeItem('sso_state');

    completeSsoLogin(code, state)
      .then((result) => {
        setAuth(result.user, result.accessToken, result.refreshToken);
        navigate('/');
      })
      .catch((err) => {
        setError(err.response?.data?.error?.message || 'SSO authentication failed');
      });
  }, [searchParams, setAuth, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700">
      <div className="w-full max-w-md">
        <div className="card text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-brand-500">
            <Shield className="h-8 w-8 text-white" />
          </div>
          {error ? (
            <>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Sign-in Failed</h2>
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                {error}
              </div>
              <a href="/login" className="btn-primary inline-flex">Back to Login</a>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Completing sign-in...</h2>
              <p className="text-sm text-gray-500">Please wait while we verify your Microsoft account.</p>
              <div className="mt-4 flex justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
