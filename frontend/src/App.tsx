import { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Ticket, 
  Hash, 
  GitBranch, 
  GitPullRequest, 
  Send,
  Loader2,
  CheckCircle2,
  Settings,
  Sparkles,
  Cpu
} from 'lucide-react';

interface JiraIssue {
  id: string;
  title: string;
  status: string;
}

interface GithubPr {
  id: number;
  title: string;
  author: string;
  url: string;
  repository: string;
}

const App = () => {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am your organizer assistant. How can I help you today?' },
  ]);
  const [input, setInput] = useState('');
  
  const [isJiraConnected, setIsJiraConnected] = useState(false);
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>([]);
  const [showJiraLogin, setShowJiraLogin] = useState(false);
  const [jiraToken, setJiraToken] = useState('');
  const [jiraEmail, setJiraEmail] = useState('');
  const [jiraDomain, setJiraDomain] = useState('');

  const [isGithubConnected, setIsGithubConnected] = useState(false);
  const [githubPrs, setGithubPrs] = useState<GithubPr[]>([]);
  const [showGithubLogin, setShowGithubLogin] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [githubUsername, setGithubUsername] = useState('');

  const [aiProvider, setAiProvider] = useState('local');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const [isConnecting, setIsConnecting] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const API_BASE = 'http://localhost:3000/api';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    checkJiraStatus();
    checkGithubStatus();
    fetchAiConfig();
  }, []);

  const fetchAiConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/ai/config`);
      const data = await res.json();
      setAiProvider(data.provider);
      setGeminiApiKey(data.geminiApiKey || '');
    } catch (err) {
      console.error('Failed to fetch AI config', err);
    }
  };

  const updateAiConfig = async (newProvider: string, newApiKey?: string) => {
    try {
      const res = await fetch(`${API_BASE}/ai/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: newProvider, geminiApiKey: newApiKey ?? geminiApiKey })
      });
      if (res.ok) {
        const data = await res.json();
        setAiProvider(data.config.provider);
        setGeminiApiKey(data.config.geminiApiKey || '');
      }
    } catch (err) {
      console.error('Failed to update AI config', err);
    }
  };

  const checkJiraStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/jira/status`);
      const data = await res.json();
      setIsJiraConnected(data.connected);
      if (data.connected) {
        setJiraDomain(data.domain || '');
        setJiraEmail(data.email || '');
        fetchJiraIssues();
      }
    } catch (err) {
      console.error('Failed to check Jira status', err);
    }
  };

  const checkGithubStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/github/status`);
      const data = await res.json();
      setIsGithubConnected(data.connected);
      if (data.connected) {
        setGithubUsername(data.username || '');
        fetchGithubPrs();
      }
    } catch (err) {
      console.error('Failed to check GitHub status', err);
    }
  };

  const handleGithubDisconnect = async () => {
    try {
      const res = await fetch(`${API_BASE}/github/disconnect`, { method: 'POST' });
      if (res.ok) {
        setIsGithubConnected(false);
        setGithubPrs([]);
        setGithubToken('');
        setShowGithubLogin(false);
      }
    } catch (err) {
      console.error('Failed to disconnect GitHub', err);
    }
  };

  const fetchGithubPrs = async () => {
    try {
      const res = await fetch(`${API_BASE}/github/prs`);
      if (res.ok) {
        const data = await res.json();
        setGithubPrs(data);
      }
    } catch (err) {
      console.error('Failed to fetch GitHub PRs', err);
    }
  };

  const handleGithubConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await fetch(`${API_BASE}/github/connect`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken })
      });
      if (res.ok) {
        setIsGithubConnected(true);
        setShowGithubLogin(false);
        const data = await res.json();
        setGithubUsername(data.user || '');
        fetchGithubPrs();
        setMessages(prev => [...prev, { role: 'assistant', content: 'Successfully connected to GitHub! I am now fetching your active pull requests.' }]);
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to connect');
      }
    } catch (err) {
      console.error('Failed to connect to GitHub', err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleJiraDisconnect = async () => {
    try {
      const res = await fetch(`${API_BASE}/jira/disconnect`, { method: 'POST' });
      if (res.ok) {
        setIsJiraConnected(false);
        setJiraIssues([]);
        setJiraDomain('');
        setJiraEmail('');
        setJiraToken('');
        setShowJiraLogin(false);
      }
    } catch (err) {
      console.error('Failed to disconnect Jira', err);
    }
  };

  const fetchJiraIssues = async () => {
    try {
      const res = await fetch(`${API_BASE}/jira/issues`);
      if (res.ok) {
        const data = await res.json();
        setJiraIssues(data);
      }
    } catch (err) {
      console.error('Failed to fetch Jira issues', err);
    }
  };

  const handleJiraConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await fetch(`${API_BASE}/jira/connect`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: jiraDomain, email: jiraEmail, token: jiraToken })
      });
      if (res.ok) {
        setIsJiraConnected(true);
        setShowJiraLogin(false);
        fetchJiraIssues();
        setMessages(prev => [...prev, { role: 'assistant', content: 'Successfully connected to Jira! I am now fetching your actual tickets.' }]);
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to connect');
      }
    } catch (err) {
      console.error('Failed to connect to Jira', err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMessage = { role: 'user' as const, content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    
    // Add a temporary loading message or state if needed
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input })
      });
      
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I had trouble reaching the AI." }]);
      }
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, { role: 'assistant', content: "Error: Could not connect to the AI service." }]);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <div className="w-72 bg-white border-r border-slate-200 p-6 flex flex-col shadow-sm">
        <h1 className="text-2xl font-extrabold mb-8 text-blue-600 flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-lg">O</div>
          Organizer
        </h1>
        
        <div className="space-y-6">
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Integrations</h2>
            <div className="space-y-2">
              <button
                onClick={() => setShowJiraLogin(true)}
                className={`flex items-center justify-between w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isJiraConnected 
                    ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Ticket size={18} className={isJiraConnected ? 'text-blue-600' : ''} />
                  Jira
                </div>
                {isJiraConnected && <CheckCircle2 size={16} className="text-blue-600" />}
              </button>
              
              <button className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all opacity-50 cursor-not-allowed">
                <Hash size={18} />
                Slack
              </button>
              
              <button className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all opacity-50 cursor-not-allowed">
                <GitBranch size={18} />
                Local Git
              </button>

              <button 
                onClick={() => setShowGithubLogin(true)}
                className={`flex items-center justify-between w-full px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isGithubConnected 
                  ? 'bg-purple-50 text-purple-700 border border-purple-100' 
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-purple-400 hover:text-purple-600'
              }`}>
                <div className="flex items-center gap-3">
                  <GitPullRequest size={18} className={isGithubConnected ? 'text-purple-600' : ''} />
                  GitHub PRs
                </div>
                {isGithubConnected && <CheckCircle2 size={16} className="text-purple-600" />}
              </button>
            </div>
          </div>

          {isJiraConnected && jiraIssues.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 mt-6">Active Tickets</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {jiraIssues.map(issue => (
                  <div key={issue.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                    <span className="font-bold text-blue-600">{issue.id}</span>
                    <p className="mt-1 text-slate-700 truncate">{issue.title}</p>
                    <span className="inline-block mt-2 px-1.5 py-0.5 bg-slate-200 rounded text-[10px] uppercase font-bold text-slate-600">
                      {issue.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isGithubConnected && githubPrs.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 mt-6">Open PRs</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {githubPrs.map(pr => (
                  <a 
                    key={pr.id} 
                    href={pr.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs hover:bg-white hover:shadow-sm transition-all"
                  >
                    <span className="font-bold text-purple-600">#{pr.id}</span>
                    <p className="mt-1 text-slate-700 truncate">{pr.title}</p>
                    <span className="inline-block mt-2 px-1.5 py-0.5 bg-purple-100 rounded text-[10px] uppercase font-bold text-purple-600">
                      {pr.repository}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-auto pt-6 border-t border-slate-100 space-y-4">
          <button 
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-3 w-full px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-colors"
          >
            <Settings size={14} />
            Settings
          </button>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium tracking-tight">v0.1.0-alpha</span>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-white">
        <header className="h-20 border-b border-slate-100 flex items-center justify-between px-10 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
              <MessageSquare className="text-slate-600" size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">AI Project Assistant</h2>
              <p className="text-xs text-slate-400 font-medium">Equipped with Jira Context</p>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-10 space-y-8 max-w-5xl mx-auto w-full">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] px-6 py-4 rounded-3xl shadow-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-slate-50 text-slate-700 border border-slate-100'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </main>

        <footer className="p-10 border-t border-slate-100 bg-white">
          <div className="max-w-4xl mx-auto flex gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask about your project, tickets, or code..."
                className="w-full pl-6 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              />
              <button 
                onClick={handleSend}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* Jira Login Modal Mock */}
      {showJiraLogin && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-blue-50 rounded-2xl">
                <Ticket className="text-blue-600" size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-800">
                {isJiraConnected ? 'Jira Connection' : 'Connect to Jira'}
              </h3>
            </div>
            
            {isJiraConnected ? (
              <div className="space-y-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Site URL</label>
                    <p className="text-sm font-semibold text-slate-700">{jiraDomain}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Account</label>
                    <p className="text-sm font-semibold text-slate-700">{jiraEmail}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</label>
                    <div className="flex items-center gap-1.5 text-green-600 font-bold text-sm">
                      <CheckCircle2 size={14} />
                      Connected
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowJiraLogin(false)}
                    className="flex-1 py-3.5 px-6 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                  >
                    Close
                  </button>
                  <button 
                    onClick={handleJiraDisconnect}
                    className="flex-1 py-3.5 px-6 rounded-xl bg-red-50 text-red-600 font-bold hover:bg-red-100 transition-all border border-red-100"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-slate-500 mb-8 text-sm leading-relaxed font-medium">
                  To fetch your tickets, Organizer needs an API Token and your Site URL. 
                  <a 
                    href="https://id.atlassian.com/manage-profile/security/api-tokens" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline ml-1"
                  >
                    Click here to generate a token.
                  </a>
                </p>

                <div className="space-y-4 mb-8">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Site URL</label>
                    <input 
                      type="text" 
                      value={jiraDomain}
                      onChange={(e) => setJiraDomain(e.target.value)}
                      placeholder="your-domain.atlassian.net" 
                      className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Atlassian Email</label>
                    <input 
                      type="email" 
                      value={jiraEmail}
                      onChange={(e) => setJiraEmail(e.target.value)}
                      placeholder="email@example.com" 
                      className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">API Token</label>
                    <input 
                      type="password" 
                      value={jiraToken}
                      onChange={(e) => setJiraToken(e.target.value)}
                      placeholder="Enter token..." 
                      className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowJiraLogin(false)}
                    className="flex-1 py-3.5 px-6 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleJiraConnect}
                    disabled={isConnecting}
                    className="flex-1 py-3.5 px-6 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isConnecting ? <Loader2 className="animate-spin" size={18} /> : 'Connect'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* GitHub Login Modal */}
      {showGithubLogin && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center">
                <GitPullRequest className="text-purple-600" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">
                  {isGithubConnected ? 'GitHub Connection' : 'Connect GitHub'}
                </h3>
                <p className="text-sm text-slate-500 font-medium">
                  {isGithubConnected ? 'Your account is linked' : 'Link your account to see real PRs'}
                </p>
              </div>
            </div>

            {isGithubConnected ? (
              <div className="space-y-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">GitHub Account</label>
                    <p className="text-sm font-semibold text-slate-700">{githubUsername}</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</label>
                    <div className="flex items-center gap-1.5 text-purple-600 font-bold text-sm">
                      <CheckCircle2 size={14} />
                      Connected
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowGithubLogin(false)}
                    className="flex-1 py-3.5 px-6 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                  >
                    Close
                  </button>
                  <button 
                    onClick={handleGithubDisconnect}
                    className="flex-1 py-3.5 px-6 rounded-xl bg-red-50 text-red-600 font-bold hover:bg-red-100 transition-all border border-red-100"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-6 mb-8">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Personal Access Token</label>
                    <input 
                      type="password" 
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxx" 
                      className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-medium"
                    />
                    <p className="mt-2 text-[10px] text-slate-400 px-1 font-medium leading-relaxed">
                      Generate a token with <code className="bg-slate-100 px-1 rounded text-purple-600">repo</code> and <code className="bg-slate-100 px-1 rounded text-purple-600">read:user</code> scopes.
                      <a 
                        href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=Organizer%20App" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-purple-600 hover:underline ml-1 font-bold"
                      >
                        Click here to create it.
                      </a>
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowGithubLogin(false)}
                    className="flex-1 py-3.5 px-6 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleGithubConnect}
                    disabled={isConnecting}
                    className="flex-1 py-3.5 px-6 rounded-xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isConnecting ? <Loader2 className="animate-spin" size={18} /> : 'Connect Token'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center">
                <Settings className="text-blue-600" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-800">Settings</h3>
                <p className="text-sm text-slate-500 font-medium">Configure your AI preferences</p>
              </div>
            </div>

            <div className="space-y-6 mb-8">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">AI Provider</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => updateAiConfig('local')}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-bold transition-all ${
                      aiProvider === 'local' 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200' 
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'
                    }`}
                  >
                    <Cpu size={18} />
                    Local
                  </button>
                  <button
                    onClick={() => updateAiConfig('gemini')}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-bold transition-all ${
                      aiProvider === 'gemini' 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200' 
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'
                    }`}
                  >
                    <Sparkles size={18} />
                    Gemini
                  </button>
                </div>
              </div>

              {aiProvider === 'gemini' && (
                <div className="animate-in slide-in-from-top-2 duration-200">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Gemini API Key</label>
                  <input 
                    type="password" 
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    onBlur={(e) => updateAiConfig('gemini', e.target.value)}
                    placeholder="Enter your API key..." 
                    className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                  />
                  <p className="mt-2 text-[10px] text-slate-400 px-1 font-medium leading-relaxed">
                    Get a key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google AI Studio</a>.
                  </p>
                </div>
              )}
            </div>

            <button 
              onClick={() => setShowSettings(false)}
              className="w-full py-3.5 px-6 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
