'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Key, ShieldCheck, Sparkles, AlertCircle, CheckCircle2, Loader2, ArrowRight, ExternalLink } from 'lucide-react';
import { checkApiKey } from '@/app/actions';

interface OnboardingFlowProps {
  onComplete: (apiKey: string) => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValidateKey = async () => {
    if (!apiKey.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await checkApiKey(apiKey.trim());
      if (result.success) {
        setStep(3); // Success step
      } else {
        setError(result.error || 'Invalid API key. Please check and try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed. Please check your internet or retry later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xl">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="w-full max-w-lg glass-card p-10 rounded-[32px] border border-white/20 shadow-2xl space-y-8 relative overflow-hidden"
          >
            <div className="space-y-4 text-center">
              <div className="mx-auto w-20 h-20 bg-gradient-to-br from-primary to-purple-600 rounded-3xl flex items-center justify-center shadow-lg shadow-primary/20">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
                Welcome to Career Ops
              </h1>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Your strategic command center for high-stakes job hunting in India. 
                Powering your search with private, local-first AI intelligence.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                <ShieldCheck className="w-6 h-6 text-primary" />
                <h3 className="font-semibold text-sm">Local-First</h3>
                <p className="text-xs text-muted-foreground">Your data stays on your machine. Always.</p>
              </div>
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                <Bot className="w-6 h-6 text-purple-500" />
                <h3 className="font-semibold text-sm">AI Powered</h3>
                <p className="text-xs text-muted-foreground">JD analysis and resume tailoring via Gemini.</p>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full h-14 bg-primary text-primary-foreground rounded-2xl font-bold text-lg shadow-xl shadow-primary/20 hover:opacity-90 transition-all flex items-center justify-center gap-2 group"
            >
              Get Started
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full max-w-lg glass-card p-10 rounded-[32px] border border-white/20 shadow-2xl space-y-8"
          >
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <Key className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">Connect Gemini</h2>
              </div>
              <p className="text-muted-foreground">
                To enable AI-driven job scoring and strategic insights, we need a Gemini API key. 
                This key is stored locally and used only for your requests.
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label htmlFor="api-key" className="text-sm font-semibold opacity-80">API Key</label>
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-1 hover:underline"
                  >
                    Get free key <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="relative group">
                  <input
                    id="api-key"
                    type="password"
                    placeholder="Paste AIzaSy... key here"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setError(null);
                    }}
                    className={`w-full px-5 py-4 bg-white/5 border ${error ? 'border-red-500/50' : 'border-white/10 group-hover:border-white/20'} rounded-2xl focus:ring-4 focus:ring-primary/20 outline-none transition-all font-mono text-sm`}
                  />
                  {loading && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    </div>
                  )}
                </div>
                {error && (
                  <motion.p 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-red-500 font-medium flex items-center gap-1.5 px-1"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    {error}
                  </motion.p>
                )}
              </div>

              <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-500">Why Gemini?</h4>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Gemini provides state-of-the-art context windows (up to 1M+ tokens), enabling us to analyze deep JDs 
                  and entire resumes with unparalleled accuracy compared to legacy models.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  disabled={loading}
                  className="flex-1 h-14 bg-white/5 text-foreground rounded-2xl font-bold border border-white/10 hover:bg-white/10 transition-all disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleValidateKey}
                  disabled={loading || !apiKey.trim()}
                  className="flex-[2] h-14 bg-primary text-primary-foreground rounded-2xl font-bold shadow-xl shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? 'Validating...' : 'Connect & Continue'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg glass-card p-12 rounded-[32px] border border-white/20 shadow-2xl space-y-8 text-center"
          >
            <div className="space-y-6">
              <div className="mx-auto w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center relative">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.2 }}
                >
                  <CheckCircle2 className="w-16 h-16 text-green-500" />
                </motion.div>
                <motion.div
                  className="absolute inset-0 rounded-full border-4 border-green-500/30"
                  animate={{ scale: [1, 1.2, 1], opacity: [1, 0, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-3xl font-bold">Systems Ready</h2>
                <p className="text-muted-foreground text-lg">
                  API Key validated successfully. <br />
                  Your Career Command Center is ready to launch.
                </p>
              </div>
            </div>

            <button
              onClick={() => onComplete(apiKey)}
              className="w-full h-16 bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-2xl font-bold text-xl shadow-xl shadow-green-500/20 hover:opacity-90 transition-all"
            >
              Enter Command Center
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
