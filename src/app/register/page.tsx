'use client';
import RegisterForm from '@/components/auth/RegisterForm';

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-100 to-cyan-100 dark:from-gray-900 dark:to-gray-950">
      <div className="w-full max-w-2xl glass rounded-3xl p-8 shadow-2xl">
        <RegisterForm />
      </div>
    </div>
  );
}