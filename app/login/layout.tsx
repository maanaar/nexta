'use client';

import React, { useState } from 'react';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Login submitted:', { email, password, rememberMe });
    // Add your login logic here
  };

  return (
    <div className="min-h-screen bg-nav flex items-center bg-admin justify-center px-4">
        <div className="w-full max-w-md ">
          {/* Logo */}
          <div className="text-center mb-8">
            {/* Replace with your actual logo image */}
            {/* <Image
              src="/logo.png"
              alt="Nexta Logo"
              width={200}
              height={60}
              priority
              className="mx-auto"
            /> */}
            <h1 className="text-5xl font-bold text-white mb-2">
              Ne<span className="text-teal-400">x</span>ta
            </h1>
          </div>

          {/* Login Form Card */}
          <div className="bg-gray-100 rounded-2xl shadow-2xl p-8">
            <div className="space-y-6">
              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  placeholder="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                  required
                />
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                  required
                />
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between text-sm">
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
                  className="text-teal-600 hover:text-teal-700 font-medium"
                >
                  forget password?
                </button>
              </div>

              {/* Login Button */}
              <button
                onClick={handleSubmit}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-lg transition duration-200 shadow-lg hover:shadow-xl"
              >
                login
              </button>

              {/* Sign Up Link */}
              <div className="text-center text-sm text-gray-600">
                Dont have an account?{' '}
                <button
                  onClick={() => console.log('Sign up clicked')}
                  className="text-teal-600 hover:text-teal-700 font-semibold"
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