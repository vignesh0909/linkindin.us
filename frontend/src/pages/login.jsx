import React, { useCallback, useEffect } from 'react';
import Navbar from '../components/navbar';
import { useAuthContext } from '../contexts/AuthContext';
import { authAPI } from '../services/auth';
import AdminPanelPage from '../pages/adminpanel';
import { Link, useNavigate } from 'react-router-dom';
import { customToast } from '../components/ToastProvider';

export default function LoginDashboardPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user: currentUser, login: authLogin } = useAuthContext();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [agreed, setAgreed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [passwordResetRequired, setPasswordResetRequired] = React.useState(false);
  const [initializing, setInitializing] = React.useState(true);
  const [emailNotVerified, setEmailNotVerified] = React.useState(false);
  const [redirecting, setRedirecting] = React.useState(false);

  // Ref to track if login is in progress to prevent race conditions
  const loginInProgress = React.useRef(false);
  const lastLoginAttempt = React.useRef(0);

  // Navigate to appropriate dashboard when user is fully logged in
  useEffect(() => {
    if (isAuthenticated && currentUser && !passwordResetRequired && !initializing) {
      console.log('User is fully logged in, checking role for navigation:', currentUser.role);
      console.log('Full user object:', currentUser);

      // Add a small delay to ensure everything is properly set
      const navigationTimeout = setTimeout(() => {
        // Navigate based on role
        if (currentUser.role === 'admin') {
          // Admin stays on the same page but renders AdminPanelPage
          console.log('Admin user, staying on current page');
          setRedirecting(false);
          return;
        } else if (currentUser.role === 'advertiser') {
          console.log('Navigating to advertiser dashboard');
          setRedirecting(true);
          navigate('/advertiser-dashboard');
          // Fallback: reset redirecting after a delay if navigation fails
          setTimeout(() => setRedirecting(false), 3000);
        } else if (currentUser.role === 'affiliate') {
          console.log('Navigating to affiliate dashboard');
          setRedirecting(true);
          navigate('/affiliate-dashboard');
          setTimeout(() => setRedirecting(false), 3000);
        } else if (currentUser.role === 'network') {
          console.log('Navigating to network dashboard');
          setRedirecting(true);
          navigate('/network-dashboard');
          setTimeout(() => setRedirecting(false), 3000);
        } else {
          // Users without specific roles go to user dashboard
          console.log('User without specific role or unknown role:', currentUser.role, 'navigating to user dashboard');
          setRedirecting(true);
          navigate('/user-dashboard');
          setTimeout(() => setRedirecting(false), 3000);
        }
      }, 100); // Small delay to ensure state is stable

      return () => clearTimeout(navigationTimeout);
    }
  }, [isAuthenticated, currentUser, passwordResetRequired, initializing, navigate]);

  // Check if user is already logged in on component mount and listen for storage changes
  React.useEffect(() => {
    // The AuthContext handles authentication checking automatically
    // Just check for password reset requirement from localStorage
    const passwordResetNeeded = localStorage.getItem('password_reset_required') === 'true';

    console.log('Checking initial state:', {
      isAuthenticated,
      user: !!currentUser,
      passwordResetNeeded
    });

    if (isAuthenticated && currentUser) {
      setPasswordResetRequired(passwordResetNeeded);
      setEmailNotVerified(false);
    } else {
      setPasswordResetRequired(false);
      setEmailNotVerified(false);
    }

    setInitializing(false);
  }, [isAuthenticated, currentUser]);

  const handleLogin = useCallback(async (e) => {
    e.preventDefault();

    // Debounce: prevent rapid successive clicks
    const now = Date.now();
    if (now - lastLoginAttempt.current < 1000) {
      console.log('Login attempt too soon, ignoring (debounce)');
      return;
    }
    lastLoginAttempt.current = now;

    // Prevent double submission using both state and ref
    if (loading || loginInProgress.current) {
      console.log('Login already in progress, ignoring duplicate request');
      return;
    }

    console.log('Starting login process...');
    loginInProgress.current = true;
    setLoading(true);
    setEmailNotVerified(false);

    try {
      console.log('Calling authLogin from context...');
      const response = await authLogin({ email, password });
      console.log('Login API response received:', response);
      console.log('User data from response:', response.user);
      console.log('User role:', response.user?.role);

      // The AuthContext will automatically update the authentication state
      // No need to manually set loggedIn and currentUser states
      setEmailNotVerified(false);

      // Check if password reset is required
      if (response.password_reset_required) {
        console.log('Password reset required');
        setPasswordResetRequired(true);
        localStorage.setItem('password_reset_required', 'true');
      } else {
        // Clear any existing password reset state
        console.log('Clearing password reset state');
        setPasswordResetRequired(false);
        localStorage.removeItem('password_reset_required');
      }

      console.log('Login successful, auth context updated');
      customToast.success('Login successful!');

    } catch (error) {
      console.error('Login failed:', error);
      // Check if error is due to email not being verified
      if (error.message && error.message.includes('verify your email')) {
        setEmailNotVerified(true);
        customToast.error("Please verify your email address before logging in.");
      } else {
        customToast.error(error.message || "Login failed. Please check your credentials.");
      }
    } finally {
      console.log('Login process completed, setting loading to false');
      loginInProgress.current = false;
      setLoading(false);
    }
  }, [loading, email, password]);

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Validate new password
    if (newPassword.length < 6) {
      customToast.error("New password must be at least 6 characters long");
      setLoading(false);
      return;
    }

    // Validate password confirmation
    if (newPassword !== confirmPassword) {
      customToast.error("New passwords do not match");
      setLoading(false);
      return;
    }

    try {
      await authAPI.resetPassword({
        new_password: newPassword
      });

      // Clear password reset state
      setPasswordResetRequired(false);
      localStorage.removeItem('password_reset_required');

      // Show success message
      customToast.success("Password reset successful! You can now log in with your new password.");

      // Reset form fields
      setNewPassword("");
      setConfirmPassword("");

    } catch (error) {
      customToast.error(error.message || "Password reset failed. Please try again.");
      console.error('Password reset error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      customToast.error('Please enter your email address first');
      return;
    }

    setLoading(true);
    try {
      const { http } = await import('../services/httpClient');
      await http.post('/users/resend-verification', { email });
      customToast.success('Verification email sent! Please check your inbox.');
      setEmailNotVerified(false);
    } catch (error) {
      customToast.error(error.message || 'Failed to send verification email');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    // Use AuthContext logout which handles everything
    logout();

    // Reset local component state
    setEmail("");
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordResetRequired(false);
    setAgreed(false);
    setEmailNotVerified(false);

    // Force a page refresh to ensure clean state
    window.location.reload();
  };

  // Show loading screen while checking initial auth state or redirecting
  if (initializing || redirecting) {
    return (
      <div className="bg-gray-50 text-gray-900 mt-20 font-sans">
        <Navbar />
        <section className="py-20 px-6 max-w-md mx-auto text-center">
          <p className="mb-4">{redirecting ? 'Redirecting to dashboard...' : 'Loading...'}</p>
          {redirecting && (
            <div className="mt-6">
              <p className="text-sm text-gray-600 mb-4">Taking too long? Click below to navigate manually:</p>
              <div className="space-y-2">
                <button
                  onClick={() => navigate('/advertiser-dashboard')}
                  className="block w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                >
                  Go to Advertiser Dashboard
                </button>
                <button
                  onClick={() => navigate('/affiliate-dashboard')}
                  className="block w-full bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
                >
                  Go to Affiliate Dashboard
                </button>
                <button
                  onClick={() => navigate('/network-dashboard')}
                  className="block w-full bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition"
                >
                  Go to Network Dashboard
                </button>
                <button
                  onClick={() => navigate('/user-dashboard')}
                  className="block w-full bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition"
                >
                  Go to User Dashboard
                </button>
                <button
                  onClick={() => setRedirecting(false)}
                  className="block w-full bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition"
                >
                  Stay on Login Page
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  // Show password reset form if required
  if (passwordResetRequired) {
    return (
      <div className="bg-gray-50 text-gray-900 mt-20 font-sans">
        <Navbar />
        <section className="py-20 px-6 max-w-md mx-auto">
          <h2 className="text-3xl font-bold mb-6">Reset Password</h2>
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New Password"
              className="w-full border px-3 py-2 rounded"
              required
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm New Password"
              className="w-full border px-3 py-2 rounded"
              required
            />
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              disabled={loading}
            >
              {loading ? 'Resetting password...' : 'Reset Password'}
            </button>
          </form>        </section>
      </div>
    );
  }

  // Show admin panel for admin users
  if (isAuthenticated && currentUser && currentUser.role === 'admin') {
    console.log('Rendering admin panel for user:', currentUser.role);
    return (
      <>
        <Navbar />
        <AdminPanelPage />
      </>
    );
  }

  // Show login form if not logged in
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 flex flex-col">
      <Navbar />

      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/10 to-purple-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-indigo-400/10 to-pink-600/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <main className="flex-1 flex items-center justify-center py-16 px-4 relative">
        <div className="w-full max-w-md">
          {/* Login Form Card */}
          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 p-8 relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600"></div>

            {/* Logo Section */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-3 mb-4">
                <img
                  src="/assets/Favicon-dark-mode.png"
                  alt="AdBond Logo"
                  className="h-12 w-auto sm:h-16 drop-shadow-lg transition-transform group-hover:scale-105"
                />
                <div>
                  <span className="font-black text-2xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">AdBond</span>
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Connect • Trust • Grow</div>
                </div>
              </div>
              <h2 className="text-3xl font-black text-gray-900 dark:text-gray-100 mb-2">Welcome Back</h2>
              <p className="text-gray-600 dark:text-gray-400">Sign in to continue your journey</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300 text-gray-900 dark:text-gray-100"
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300 text-gray-900 dark:text-gray-100"
                    placeholder="Enter your password"
                  />
                </div>
              </div>

              {/* Email Verification Prompt */}
              {emailNotVerified && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
                        Email Verification Required
                      </h4>
                      <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-3">
                        Please verify your email address before logging in. Check your inbox for a verification link.
                      </p>
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={loading}
                        className="text-sm bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                      >
                        {loading ? 'Sending...' : 'Resend Verification Email'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded transition-colors"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700 dark:text-gray-300 font-medium">
                    Remember me
                  </label>
                </div>
                <button type="button" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-semibold transition-colors">
                  Forgot password?
                </button>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={loading || loginInProgress.current}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-3 px-4 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5 disabled:transform-none disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </div>
                ) : 'Sign In'}
              </button>
            </form>

            {/* Sign Up Link */}
            <div className="mt-8 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                Don't have an account?{' '}
                <Link to="/signup" className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-semibold transition-colors">
                  Sign up for free
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
