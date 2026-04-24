'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Briefcase, 
  Bot, 
  TrendingUp, 
  Bell, 
  Calendar, 
  AlertCircle, 
  ArrowRight, 
  Search, 
  RefreshCw, 
  Sparkles, 
  CheckCircle2, 
  Clock,
  Layers,
  Zap,
  Globe,
  FileText,
  UserPlus,
  ChevronRight,
  Target
} from 'lucide-react';
import { performAiSearch, fetchCommandCenter, runQuickScan, refreshScoring, generateBrief, updateConfig } from './actions-dashboard';
import { TIER_COLORS } from '@/lib/constants/scoring';
import { Loader2, X } from 'lucide-react';

import { OnboardingFlow } from '@/components/OnboardingFlow';

export default function CommandCenter() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any>(null);
  const [tierFilter, setTierFilter] = useState('All');

  const loadData = async () => {
    try {
      const res = await fetchCommandCenter();
      setData(res);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      if (data?.systemStatus?.isScanning) {
        loadData();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [data?.systemStatus?.isScanning]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await runQuickScan();
    await loadData();
    setRefreshing(false);
  };

  const handleSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
    e?.preventDefault();
    const query = overrideQuery || searchQuery;
    if (!query.trim()) return;
    
    setSearching(true);
    try {
      const results = await performAiSearch(query);
      setSearchResults(results);
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setSearching(false);
    }
  };

  const handleOnboardingComplete = async (apiKey: string) => {
    await updateConfig(apiKey);
    await loadData();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] space-y-6">
        <div className="relative">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <div className="absolute inset-0 blur-xl bg-primary/20 animate-pulse" />
        </div>
        <p className="text-muted-foreground animate-pulse font-medium tracking-wide">Initializing Command Center...</p>
      </div>
    );
  }

  if (!data?.config?.isConfigured) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  const stats = [
    { label: 'Actionable Jobs', value: data.stats.actionableJobs, icon: Briefcase, color: '#007AFF', gradient: 'from-blue-500/20 to-blue-600/5' },
    { label: 'Apply Today', value: data.stats.applyToday, icon: Zap, color: '#34C759', gradient: 'from-green-500/20 to-green-600/5' },
    { label: 'Apply in 3 Days', value: data.stats.applyIn3Days, icon: Clock, color: '#FF9500', gradient: 'from-orange-500/20 to-orange-600/5' },
    { label: 'Total Scraped', value: data.stats.totalScraped, icon: Layers, color: '#AF52DE', gradient: 'from-purple-500/20 to-purple-600/5' },
    { label: 'Portals Active', value: data.stats.portalsActive, icon: Globe, color: '#5856D6', gradient: 'from-indigo-500/20 to-indigo-600/5' },
    { label: 'Average Score', value: `${data.stats.averageScore}%`, icon: TrendingUp, color: '#FF2D55', gradient: 'from-pink-500/20 to-pink-600/5' },
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-10 animate-in fade-in duration-700 pb-20 px-4 md:px-8">
      
      {/* Premium Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pt-8">
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest rounded-full">System v2.5</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Active Operations</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
            Command Center
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Strategic monitoring and real-time execution for your career trajectory.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {data.systemStatus.isScanning && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 px-4 py-2 bg-primary/10 border border-primary/20 rounded-2xl text-primary text-xs font-bold uppercase tracking-widest"
            >
              <div className="relative">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <div className="absolute inset-0 blur-sm bg-primary/40 animate-pulse" />
              </div>
              Scanning {data.systemStatus.scanProgress}%
            </motion.div>
          )}
          <button 
            onClick={handleRefresh}
            disabled={refreshing || data.systemStatus.isScanning}
            className="group relative px-6 py-2.5 bg-card hover:bg-muted border border-border/50 rounded-2xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50 overflow-hidden"
          >
            <div className="relative z-10 flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${refreshing || data.systemStatus.isScanning ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
              Sync Portals
            </div>
          </button>
          <Link href="/discover" className="relative px-8 py-2.5 bg-primary text-primary-foreground rounded-2xl font-bold text-sm shadow-xl shadow-primary/20 hover:opacity-90 transition-all active:scale-95 flex items-center gap-2">
            Discover
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Stats Grid with Glassmorphism */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-5">
        {stats.map((stat, i) => (
          <motion.div 
            key={i} 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`relative group bg-card border border-border/40 rounded-[24px] p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all overflow-hidden`}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
            <div className="relative z-10 space-y-4">
              <div className="p-3 rounded-2xl w-fit group-hover:scale-110 transition-transform duration-500" style={{ backgroundColor: `${stat.color}15` }}>
                <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] mb-1">{stat.label}</p>
                <p className="text-3xl font-bold tabular-nums tracking-tighter">{stat.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* AI Intelligence Surface */}
      <form onSubmit={handleSearch} className="relative group w-full max-w-5xl mx-auto py-4">
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-[32px] blur-xl opacity-10 group-hover:opacity-30 transition duration-1000"></div>
        <div className="relative bg-card/80 backdrop-blur-2xl border border-white/20 rounded-[28px] p-2 shadow-2xl">
          <div className="flex items-center px-6 py-3 gap-4">
            <div className="relative">
              <Bot className={`w-8 h-8 text-primary ${searching ? 'animate-bounce' : ''}`} />
              {searching && <div className="absolute inset-0 blur-md bg-primary/50 animate-pulse" />}
            </div>
            <input 
              type="text" 
              placeholder="Query Gemini (e.g. 'high-paying remote React roles in Bangalore')" 
              className="flex-1 bg-transparent border-none outline-none text-xl py-2 placeholder:text-muted-foreground/30 font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={searching}
            />
            <button 
              type="submit"
              disabled={searching || !searchQuery.trim()}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-2xl font-bold hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-primary/20 flex items-center gap-2"
            >
              {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Search className="w-5 h-5" /> Analyze</>}
            </button>
          </div>
        </div>

        {/* AI Insights Panel */}
        <AnimatePresence>
          {searchResults && (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              className="absolute top-full left-0 right-0 mt-6 bg-card/95 backdrop-blur-3xl border border-white/20 rounded-[32px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] z-50 overflow-hidden max-h-[75vh] flex flex-col"
            >
              <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-amber-500" />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg">AI Strategic Insights</h4>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold opacity-60">Synthesis complete</p>
                  </div>
                </div>
                <button onClick={() => setSearchResults(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors group">
                  <X className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
                </button>
              </div>
              <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar">
                <div className="prose prose-lg dark:prose-invert max-w-none">
                  <p className="text-foreground/90 leading-relaxed font-medium whitespace-pre-wrap">{searchResults.answer}</p>
                </div>
                
                {searchResults.relatedJobs?.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                      <Target className="w-4 h-4 text-primary" />
                      <h5 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">High-Confidence Matches</h5>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {searchResults.relatedJobs.map((job: any) => (
                        <Link 
                          key={job.id} 
                          href={`/pipeline/create?scoredJobId=${job.id}`}
                          className="flex items-center justify-between p-5 bg-white/5 hover:bg-white/10 rounded-[24px] border border-white/10 transition-all group relative overflow-hidden"
                        >
                          <div className="min-w-0 relative z-10">
                            <p className="font-bold text-base truncate group-hover:text-primary transition-colors">{job.title}</p>
                            <p className="text-sm text-muted-foreground font-medium">{job.company}</p>
                          </div>
                          <div className="flex items-center gap-4 relative z-10">
                            <div className="text-right">
                              <p className="text-lg font-bold text-primary">{Math.round(job.relevance * 100)}%</p>
                              <p className="text-[9px] font-bold uppercase tracking-tighter opacity-50">Match</p>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                              <ArrowRight className="w-4 h-4" />
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {searchResults.suggestedActions?.length > 0 && (
                <div className="p-6 bg-white/5 border-t border-white/10 flex gap-3 overflow-x-auto pb-6 no-scrollbar px-8">
                  {searchResults.suggestedActions.map((action: string, i: number) => (
                    <button 
                      key={i}
                      onClick={() => {
                        setSearchQuery(action);
                        handleSearch(undefined, action);
                      }}
                      className="whitespace-nowrap px-4 py-2 bg-background/50 hover:bg-primary hover:text-primary-foreground border border-white/10 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      {/* Dual Panel Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* Left Column: Intelligence Priority Queue */}
        <div className="lg:col-span-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                <Target className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h3 className="text-2xl font-bold">Priority Queue</h3>
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest opacity-60">High relevance targets</p>
              </div>
            </div>
            <div className="flex p-1.5 bg-muted/40 backdrop-blur rounded-2xl border border-border/50">
              {['All', 'A', 'B'].map(t => (
                <button 
                  key={t}
                  onClick={() => setTierFilter(t)}
                  className={`text-[11px] font-bold uppercase tracking-wider px-6 py-2 rounded-xl transition-all ${tierFilter === t ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {t === 'All' ? 'Everything' : `Tier ${t}`}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            {data.priorityQueue.length === 0 ? (
              <div className="text-center py-32 bg-muted/20 rounded-[32px] border-2 border-dashed border-border/50">
                <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Briefcase className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <h4 className="text-xl font-bold opacity-40">No Targets Detected</h4>
                <p className="text-muted-foreground max-w-xs mx-auto mt-2">Run a synchronization scan to populate your high-priority queue.</p>
              </div>
            ) : (
              <div className="grid gap-5">
                {data.priorityQueue
                  .filter((j: any) => tierFilter === 'All' || j.scoredJob.tier === tierFilter)
                  .map((job: any, index: number) => (
                  <motion.div 
                    key={job.scoredJob.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="relative bg-card border border-border/60 rounded-[28px] overflow-hidden hover:shadow-2xl hover:shadow-primary/5 transition-all group"
                  >
                    <div className="p-6 md:p-8 flex flex-col md:flex-row gap-8 items-start md:items-center">
                      
                      {/* Score Indicator */}
                      <div className="relative w-20 h-20 flex-shrink-0">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/20" />
                          <motion.circle 
                            cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" 
                            className="text-primary"
                            strokeDasharray="282.7"
                            initial={{ strokeDashoffset: 282.7 }}
                            animate={{ strokeDashoffset: 282.7 - (282.7 * job.scoredJob.score) / 100 }}
                            transition={{ duration: 1.5, ease: "easeOut" }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-black tracking-tighter">{job.scoredJob.score}</span>
                          <span className="text-[8px] font-black uppercase opacity-40 -mt-1">PTS</span>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h4 className="text-xl font-bold truncate group-hover:text-primary transition-colors tracking-tight">{job.normalizedJob.title}</h4>
                          <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${TIER_COLORS[job.scoredJob.tier]}`}>
                            Tier {job.scoredJob.tier}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground/80 flex-wrap">
                          <span className="flex items-center gap-1.5 text-foreground">
                            <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center font-bold text-[10px]">
                              {job.normalizedJob.company.charAt(0)}
                            </div>
                            {job.normalizedJob.company}
                          </span>
                          {job.normalizedJob.location && (
                            <span className="flex items-center gap-1.5">
                              <Globe className="w-3.5 h-3.5 opacity-40" />
                              {job.normalizedJob.location}
                            </span>
                          )}
                          {job.normalizedJob.portal && (
                            <span className="flex items-center gap-1.5 capitalize">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                              {job.normalizedJob.portal}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap md:flex-col lg:flex-row gap-3 w-full md:w-auto">
                        <Link 
                          href={`/pipeline/create?scoredJobId=${job.scoredJob.id}`} 
                          className="flex-1 md:w-full lg:flex-none text-center px-8 py-3 bg-primary text-primary-foreground rounded-2xl text-[11px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-primary/20 active:scale-95"
                        >
                          Execute
                        </Link>
                        <button 
                          onClick={async () => {
                            setSearching(true);
                            try {
                              const res = await generateBrief(job.scoredJob.id);
                              setSearchResults({
                                answer: res.brief,
                                suggestedActions: ["Draft Resume", "Compose Email", "AI Outreach"]
                              });
                            } catch (err) {
                              console.error("Brief generation failed", err);
                            } finally {
                              setSearching(false);
                            }
                          }}
                          className="flex-1 md:w-full lg:flex-none px-6 py-3 bg-card hover:bg-muted text-foreground border border-border/80 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                          <Zap className="w-3.5 h-3.5 text-amber-500" />
                          Brief
                        </button>
                        <button className="p-3 bg-card hover:bg-muted border border-border/80 rounded-2xl transition-all group/btn active:scale-90">
                          <FileText className="w-4 h-4 text-muted-foreground group-hover/btn:text-primary transition-colors" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
            
            <div className="pt-8 text-center">
              <Link href="/discover" className="group inline-flex items-center gap-2 px-8 py-4 bg-muted/30 hover:bg-muted/50 rounded-2xl text-sm font-bold transition-all">
                Access Discovered Intelligence 
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </div>

        {/* Right Column: Strategic Panels */}
        <div className="lg:col-span-4 space-y-10">
          
          {/* Visualized Funnel */}
          <section className="bg-card/50 backdrop-blur-xl border border-border/40 rounded-[32px] p-8 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <TrendingUp className="w-24 h-24" />
            </div>
            <div className="relative z-10 space-y-8">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground opacity-50">Operation Funnel</h4>
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              </div>
              <div className="space-y-6">
                {data.funnel.map((stage: any, i: number) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between items-end">
                      <span className="text-sm font-bold">{stage.name}</span>
                      <span className="text-xl font-black tracking-tighter">{stage.count}</span>
                    </div>
                    <div className="h-3 w-full bg-muted/50 rounded-full overflow-hidden p-0.5 border border-border/20">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(stage.count / Math.max(...data.funnel.map((s: any) => s.count || 1))) * 100}%` }}
                        transition={{ duration: 1.5, delay: i * 0.1, ease: "circOut" }}
                        className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full shadow-[0_0_12px_rgba(0,122,255,0.4)]" 
                      />
                    </div>
                    {i < data.funnel.length - 1 && stage.conversionRate !== undefined && (
                      <div className="flex justify-center -mb-2">
                        <div className="text-[10px] font-black text-primary px-3 py-1 bg-primary/5 rounded-full border border-primary/10">
                          {Math.round(stage.conversionRate)}% Efficiency
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Infrastructure Health */}
          <section className="bg-card/50 backdrop-blur-xl border border-border/40 rounded-[32px] p-8 shadow-sm">
            <h4 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground opacity-50 mb-8">Node Status</h4>
            <div className="space-y-6">
              {data.systemStatus.portalHealth.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className={`w-3 h-3 rounded-full ${p.status === 'complete' ? 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)]' : p.status === 'error' ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]' : 'bg-blue-500 animate-pulse shadow-[0_0_12px_rgba(59,130,246,0.4)]'}`} />
                      {p.status !== 'complete' && p.status !== 'error' && (
                        <div className="absolute inset-0 rounded-full border border-blue-500 animate-ping opacity-20" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold capitalize group-hover:text-primary transition-colors">{p.portal}</p>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">{p.status === 'complete' ? 'Operational' : p.status === 'error' ? 'Degraded' : 'Active Scan'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-black tracking-tight">{p.jobsFound}</span>
                    <p className="text-[8px] font-bold opacity-30 uppercase tracking-tighter">Hits</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Intelligence Feed */}
          <section className="bg-card/50 backdrop-blur-xl border border-border/40 rounded-[32px] p-8 shadow-sm">
            <h4 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground opacity-50 mb-8">Recent Activity</h4>
            <div className="space-y-6">
              {data.crm.recentActivity?.slice(0, 5).map((act: any, i: number) => (
                <div key={i} className="flex gap-4 group">
                  <div className="relative">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shadow-[0_0_8px_rgba(0,122,255,0.6)]" />
                    {i < 4 && <div className="absolute top-4 bottom-[-24px] left-[3px] w-[1px] bg-border/40" />}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold leading-tight group-hover:text-primary transition-colors">{act.title}</p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">
                      {new Date(act.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              {(!data.crm.recentActivity || data.crm.recentActivity.length === 0) && (
                <div className="py-8 text-center">
                  <p className="text-xs text-muted-foreground font-medium italic opacity-40">Intelligence feed empty.</p>
                </div>
              )}
            </div>
            <Link href="/pipeline" className="flex items-center justify-center gap-2 mt-8 py-3 bg-muted/20 hover:bg-muted/40 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all">
              Launch Pipeline
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </section>

          {/* Tactical Shortcuts */}
          <div className="grid grid-cols-2 gap-4">
            <Link href="/pipeline/create" className="flex flex-col items-center justify-center p-6 bg-card/50 backdrop-blur border border-border/40 rounded-[28px] hover:bg-primary hover:text-primary-foreground transition-all gap-3 group shadow-sm active:scale-95">
              <UserPlus className="w-6 h-6 text-primary group-hover:text-primary-foreground transition-colors" />
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">Add Target</span>
            </Link>
            <Link href="/settings" className="flex flex-col items-center justify-center p-6 bg-card/50 backdrop-blur border border-border/40 rounded-[28px] hover:bg-primary hover:text-primary-foreground transition-all gap-3 group shadow-sm active:scale-95">
              <Bot className="w-6 h-6 text-primary group-hover:text-primary-foreground transition-colors" />
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">Configure</span>
            </Link>
          </div>

        </div>

      </div>

    </div>
  );
}
