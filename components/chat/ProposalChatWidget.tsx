'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, X, MessageCircle, Minimize2 } from 'lucide-react';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    text: string;
}

export default function ProposalChatWidget({ token, businessName }: { token: string, businessName: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { id: 'welcome', role: 'assistant', text: \`Hi! I've analyzed \${businessName}'s digital presence. Ask me anything about your score or how to improve it!\` }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [conversationId, setConversationId] = useState<string | undefined>(undefined);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    const suggestions = [
        "Why is my score so low?",
        "What should I fix first?",
        "How long to see results?"
    ];

    const sendMessage = async (text: string) => {
        if (!text.trim()) return;

        const userMsg: Message = { id: Date.now().toString(), role: 'user', text };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/chat/proposal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    message: text,
                    conversationId
                })
            });
            
            const data = await res.json();
            
            if (data.error) {
                // handle error
            } else {
                setConversationId(data.conversationId);
                const botMsg: Message = { id: Date.now().toString(), role: 'assistant', text: data.message };
                setMessages(prev => [...prev, botMsg]);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSuggest = (q: string) => {
        sendMessage(q);
    };

    if (!isOpen) {
        return (
            <button 
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:bg-indigo-700 transition-all z-50 flex items-center gap-2 animate-bounce-subtle"
            >
                <MessageCircle size={24} />
                <span className="font-bold pr-2">Ask the Expert</span>
            </button>
        );
    }

    return (
        <div className="fixed bottom-6 right-6 w-96 h-[500px] bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300">
            {/* Header */}
            <div className="bg-indigo-900 text-white p-4 flex justify-between items-center shrink-0">
                <div>
                    <div className="font-bold flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        Audit Assistant
                    </div>
                    <div className="text-xs text-indigo-200">AI-Powered Analysis</div>
                </div>
                <button onClick={() => setIsOpen(false)} className="text-indigo-200 hover:text-white">
                    <Minimize2 size={18} />
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 text-sm">
                {messages.map((m) => (
                    <div key={m.id} className={`flex ${ m.role === 'user' ? 'justify-end' : 'justify-start' }`}>
                        <div className={`max - w - [85 %] rounded - 2xl p - 3 ${
            m.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-none'
                : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'
        }`}>
                            {m.text}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-slate-200 text-slate-500 rounded-2xl p-3 text-xs italic animate-pulse">
                            Thinking...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Suggestions (Only show provided active conversation is short) */}
            {messages.length < 4 && !isLoading && (
                 <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
                     {suggestions.map(s => (
                         <button 
                             key={s} 
                             onClick={() => handleSuggest(s)}
                             className="whitespace-nowrap bg-indigo-50 text-indigo-700 text-xs px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors border border-indigo-100"
                         >
                             {s}
                         </button>
                     ))}
                 </div>
            )}

            {/* Input */}
            <div className="p-4 bg-white border-t border-slate-100 shrink-0">
                <form 
                    onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
                    className="flex gap-2"
                >
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type your question..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                        disabled={isLoading}
                    />
                    <button 
                        type="submit" 
                        disabled={isLoading || !input.trim()}
                        className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        <Send size={18} />
                    </button>
                </form>
                <div className="text-[10px] text-center text-slate-400 mt-2">
                    AI can make mistakes. Check important info.
                </div>
            </div>
        </div>
    );
}
