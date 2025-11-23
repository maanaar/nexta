'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import nexta from '@/static/nexta.png'


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed. Please try again.');
        setIsLoading(false);
        return;
      }

      // Login successful - redirect to admin page
      if (data.success) {
        router.push('/admin');
        router.refresh();
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-nav bg-admin min-h-screen flex">
        <div className="flex flex-row  min-h-screen w-[80%] items-center justify-end pr-8 gap-x-8 sm:pr-12 lg:pr-16">
          {/* Logo */}
          <div className="absolute top-[10%] w-[20%] h-[20%] left-[10%] pt-8 pl-8">
            <Image
              src={nexta}
              alt="Nexta"
              width={200}
              height={60}
              priority
            />
          </div>

          {/* Login Form Card */}
          <div className="rounded-2xl w-[50%] h-[60%] shadow-2xl   flex items-center justify-center space-x-8 md:mr-6 lg:mr-8" style={{ backgroundColor: '#ffffff' }}>
            <div className="flex flex-col gap-y-16 w-[80%] px-8 pt-8 pb-8">
              {/* Error Message */}
              {error && (
                <div className="w-full p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}
              {/* Email Field */}
              <div className="w-full font-sans">
                <label htmlFor="email" className="block text-sm font-semibold  text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  placeholder="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition"
                  style={{ backgroundColor: '#ffffff' }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#14b8a6';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(20, 184, 166, 0.5)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  required
                />
              </div>

              {/* Password Field */}
              <div className="w-full">
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition"
                  style={{ backgroundColor: '#ffffff' }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#14b8a6';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(20, 184, 166, 0.5)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  required
                />
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between text-sm w-full">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 mr-2"
                  />
                  <span className="text-gray-700">Remember Me</span>
                </label>
                <button
                  onClick={() => console.log('Forgot password clicked')}
                  className="font-medium"
                  style={{ color: '#0d9488' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#0f766e'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#0d9488'}
                >
                  forget password?
                </button>
              </div>

              {/* Login Button */}
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="w-full text-white font-semibold py-3 rounded-xl transition duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#0d9488' }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = '#0f766e';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = '#0d9488';
                  }
                }}
              >
                {isLoading ? 'Logging in...' : 'login'}
              </button>

              {/* Sign Up Link */}
              <div className="text-center text-sm text-gray-600 w-full">
                Dont have an account?{' '}
                <button
                  onClick={() => console.log('Sign up clicked')}
                  className="font-semibold"
                  style={{ color: '#0d9488' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#0f766e'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#0d9488'}
                >
                  Sign up
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    
  );
}