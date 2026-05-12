import { useFormik } from 'formik';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as yup from 'yup';
import { login } from '../services/auth';

const Login = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const formik = useFormik({
    initialValues: {
      email: '',
      password: '',
    },
    validationSchema: yup.object({
      email: yup.string().email('Enter a valid email').required('Email is required'),
      password: yup.string().min(8, 'Min 8 characters').required('Password is required'),
    }),
    onSubmit: async (values, helpers) => {
      setError('');
      try {
        await login(values);
        navigate('/dashboard');
      } catch {
        setError('Invalid email or password.');
      } finally {
        helpers.setSubmitting(false);
      }
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-lg">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">PyLoom Hospitality Login</h1>
        <form onSubmit={formik.handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              name="email"
              type="email"
              onChange={formik.handleChange}
              value={formik.values.email}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
            />
            {formik.touched.email && formik.errors.email && (
              <p className="mt-1 text-sm text-red-600">{formik.errors.email}</p>
            )}
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              name="password"
              type="password"
              onChange={formik.handleChange}
              value={formik.values.password}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
            />
            {formik.touched.password && formik.errors.password && (
              <p className="mt-1 text-sm text-red-600">{formik.errors.password}</p>
            )}
          </label>
          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={formik.isSubmitting}
            className="w-full rounded-2xl bg-indigo-600 px-5 py-3 text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {formik.isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
