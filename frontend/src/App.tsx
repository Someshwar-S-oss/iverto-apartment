import { Shield, Sparkles } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card p-8 max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-tr from-[#cd0447] to-[#e91e63] flex items-center justify-center text-white shadow-lg">
          <Shield className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          iverto
        </h1>
        <p className="text-sm text-gray-500">
          Gate & Community Access Platform
        </p>
        <div className="pt-4 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-50 py-1.5 px-3 rounded-full border border-emerald-200 w-fit mx-auto">
          <Sparkles className="w-3.5 h-3.5" />
          Frontend Scaffolding Active
        </div>
        <div className="pt-2">
          <button className="btn-primary w-full">
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
