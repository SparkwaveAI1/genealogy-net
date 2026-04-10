'use client';

import { useState } from 'react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type GeminiResult = {
  text: string;
  sources: Array<{ title: string; uri: string }>;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [geminiResult, setGeminiResult] = useState<GeminiResult | null>(null);
  const [isGeminiLoading, setIsGeminiLoading] = useState(false);

  // Document upload context
  const [individualName, setIndividualName] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [notes, setNotes] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const quickPrompts = [
    'What sources should I search for birth records?',
    'How do I verify conflicting dates?',
    'What are reliable genealogy databases?',
    'How do I cite census records?',
  ];

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const handleSendMessage = async (useDeep = false) => {
    if (!input.trim()) return;

    const newMessage: Message = { role: 'user', content: input };
    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          deep: useDeep,
        }),
      });

      const data = await response.json();

      if (data.content && data.content[0]?.text) {
        setMessages([
          ...updatedMessages,
          { role: 'assistant', content: data.content[0].text },
        ]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeepResearch = async () => {
    if (!input.trim()) return;

    setIsGeminiLoading(true);
    setGeminiResult(null);

    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: input }),
      });

      const data = await response.json();
      setGeminiResult(data);
    } catch (error) {
      console.error('Error with deep research:', error);
    } finally {
      setIsGeminiLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadedFile(e.target.files[0]);
    }
  };

  return (
    <div className="flex h-screen bg-zinc-50">
      {/* Left Sidebar */}
      <div className="w-80 bg-white border-r border-zinc-200 p-6 overflow-y-auto">
        <h1 className="text-2xl font-bold text-zinc-900 mb-6">
          Genealogy Research
        </h1>

        {/* Quick Prompts */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">
            Quick Prompts
          </h2>
          <div className="space-y-2">
            {quickPrompts.map((prompt, index) => (
              <button
                key={index}
                onClick={() => handleQuickPrompt(prompt)}
                className="w-full text-left text-sm px-3 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Document Upload */}
        <div className="border-t border-zinc-200 pt-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">
            Document Upload
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                Individual Name
              </label>
              <input
                type="text"
                value={individualName}
                onChange={(e) => setIndividualName(e.target.value)}
                placeholder="e.g., John Johnson"
                className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                Document Type
              </label>
              <input
                type="text"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                placeholder="e.g., Birth Certificate"
                className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional context..."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                Upload File
              </label>
              <input
                type="file"
                onChange={handleFileUpload}
                className="w-full text-sm text-zinc-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {uploadedFile && (
                <p className="text-xs text-zinc-500 mt-1">
                  {uploadedFile.name}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Chat */}
      <div className="flex-1 flex flex-col">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-zinc-400">
              <p>Start a conversation about your genealogy research</p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-2xl px-4 py-3 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-zinc-900 border border-zinc-200'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-2xl px-4 py-3 rounded-lg bg-white text-zinc-900 border border-zinc-200">
                <p className="text-sm text-zinc-500">Thinking...</p>
              </div>
            </div>
          )}

          {/* Gemini Deep Research Results */}
          {geminiResult && (
            <div className="border-t-2 border-blue-200 pt-4 mt-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">
                  Deep Research Results
                </h3>
                <p className="text-sm text-zinc-800 whitespace-pre-wrap mb-3">
                  {geminiResult.text}
                </p>
                {geminiResult.sources && geminiResult.sources.length > 0 && (
                  <div className="border-t border-blue-200 pt-3 mt-3">
                    <p className="text-xs font-semibold text-blue-900 mb-2">
                      Sources:
                    </p>
                    <ul className="space-y-1">
                      {geminiResult.sources.map((source, idx) => (
                        <li key={idx}>
                          <a
                            href={source.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-700 hover:underline"
                          >
                            {source.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {isGeminiLoading && (
            <div className="border-t-2 border-blue-200 pt-4 mt-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  Conducting deep research...
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-zinc-200 p-4 bg-white">
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ask about genealogy research..."
              className="flex-1 px-4 py-3 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading || isGeminiLoading}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={isLoading || isGeminiLoading || !input.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-300 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
          <button
            onClick={handleDeepResearch}
            disabled={isLoading || isGeminiLoading || !input.trim()}
            className="w-full px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:bg-zinc-300 disabled:cursor-not-allowed transition-colors"
          >
            Deep Research (Gemini + Google Search)
          </button>
        </div>
      </div>
    </div>
  );
}
