import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Logo } from '../components/Logo.js';
import { Button } from '../components/ui/Button.js';
import { useLogin } from '../api/queries.js';
import { ApiError } from '../api/client.js';
import { useState } from 'react';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Required'),
});
type Form = z.infer<typeof schema>;

export function LoginPage() {
  const { register, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
  });
  const login = useLogin();
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex justify-center mb-5">
          <Logo size={40} />
        </div>
        <h1 className="text-2xl mb-1 text-center">Welcome back</h1>
        <p className="text-muted text-sm text-center mb-5">Sign in to your buddies.</p>
        <form
          onSubmit={handleSubmit(async (vals) => {
            setErr(null);
            try {
              await login.mutateAsync(vals);
              nav('/', { replace: true });
            } catch (e) {
              setErr(e instanceof ApiError ? e.message : 'Sign in failed');
            }
          })}
          className="space-y-3"
        >
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" type="email" autoComplete="email" {...register('email')} />
            {formState.errors.email && (
              <p className="text-danger text-sm mt-1">{formState.errors.email.message}</p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" type="password" autoComplete="current-password" {...register('password')} />
            {formState.errors.password && (
              <p className="text-danger text-sm mt-1">{formState.errors.password.message}</p>
            )}
          </div>
          {err && <p className="text-danger text-sm">{err}</p>}
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="text-sm text-muted text-center mt-5">
          New here?{' '}
          <Link to="/signup" className="text-primary font-bold">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
