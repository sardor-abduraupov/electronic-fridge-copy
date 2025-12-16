import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, X, Zap, Activity, Radio, WifiOff } from 'lucide-react';


interface Props {
  isActive: boolean;
  onClose: () => void;
  onToolUse: (tool: string, args: any) => Promise<any>;
}

const LiveAssistant: React.FC<Props> = ({ isActive, onClose, onToolUse }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [transcripts, setTranscripts] = useState<{user: boolean, text: string}[]>([]);
  const [statusText, setStatusText] = useState("Инициализация...");
  const [interactionState, setInteractionState] = useState<'idle' | 'listening' | 'speaking'>('idle');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  
  // Analysers for visualization
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<WebSocket | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);

  const toolCallbackRef = useRef(onToolUse);
  useEffect(() => {
    toolCallbackRef.current = onToolUse;
  }, [onToolUse]);

  // --- Visualizer Logic ---
  const startVisualizer = () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      
      const render = () => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          const width = canvas.width;
          const height = canvas.height;
          ctx.clearRect(0, 0, width, height);

          // Get Frequency Data for nicer bars
          const getFreqData = (analyser: AnalyserNode | null) => {
              if (!analyser) return new Uint8Array(0);
              const bufferLength = analyser.frequencyBinCount;
              const dataArray = new Uint8Array(bufferLength);
              analyser.getByteFrequencyData(dataArray);
              return dataArray;
          };

          const inputFreqs = getFreqData(inputAnalyserRef.current);
          const outputFreqs = getFreqData(outputAnalyserRef.current);
          
          // Calculate average volumes for state detection
          const avgVol = (arr: Uint8Array) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
          const inputVol = avgVol(inputFreqs);
          const outputVol = avgVol(outputFreqs);

          // Determine State
          let currentState: 'idle' | 'listening' | 'speaking' = 'idle';
          if (outputVol > 10) currentState = 'speaking';
          else if (inputVol > 15) currentState = 'listening';
          
          // Update React state sparsely to avoid re-renders (only if changed significantly? 
          // Actually better to just use a ref or derived value for the UI text in canvas, 
          // but we want the text below to update. 
          // To prevent lag, we can throttle this or just accept React handles it reasonably well.)
          // We will use a ref-based approach for smooth animation but state for text
          // For now, let's just update the visualizer and let the state update less frequently if needed.
          
          // Draw Visualization
          const barCount = 32; // Number of bars
          const barWidth = (width / barCount) * 0.8;
          const spacing = (width / barCount) * 0.2;
          
          for (let i = 0; i < barCount; i++) {
              // Combine input and output data for visualization
              // Lower frequencies are usually at the start of the array
              // We map 'i' to the frequency array index
              
              // Map linear index to logarithmic frequency index approx
              const dataIndex = Math.floor((i / barCount) * (inputFreqs.length / 2)); 
              
              const inVal = inputFreqs[dataIndex] || 0;
              const outVal = outputFreqs[dataIndex] || 0;
              
              // Determine bar height and color
              let barHeight = 0;
              let fillStyle = '#334155'; // Slate 700 (Base)

              if (currentState === 'speaking') {
                  barHeight = (outVal / 255) * height * 0.8;
                  fillStyle = `hsl(270, 90%, ${50 + (outVal/255)*40}%)`; // Purple gradient
              } else if (currentState === 'listening') {
                  barHeight = (inVal / 255) * height * 0.8;
                  fillStyle = `hsl(150, 90%, ${40 + (inVal/255)*40}%)`; // Emerald gradient
              } else {
                  // Idle wave
                  const wave = Math.sin((Date.now() / 300) + (i * 0.5));
                  barHeight = 4 + (wave * 3);
                  fillStyle = '#475569'; // Slate 600
              }

              // Rounded Bars centered vertically
              const x = i * (barWidth + spacing) + spacing/2;
              const y = (height - barHeight) / 2;
              
              ctx.fillStyle = fillStyle;
              ctx.beginPath();
              ctx.roundRect(x, y, barWidth, barHeight, 4);
              ctx.fill();
          }

          animationFrameRef.current = requestAnimationFrame(render);
      };
      render();
  };

  // State updater for UI text (throttled)
  useEffect(() => {
      if (!isConnected) return;
      
      const interval = setInterval(() => {
          if (!inputAnalyserRef.current || !outputAnalyserRef.current) return;
          
          const getVol = (analyser: AnalyserNode) => {
             const arr = new Uint8Array(analyser.frequencyBinCount);
             analyser.getByteFrequencyData(arr);
             return arr.reduce((a,b)=>a+b,0)/arr.length;
          };

          const inVol = getVol(inputAnalyserRef.current);
          const outVol = getVol(outputAnalyserRef.current);
          
          if (outVol > 10) {
              setInteractionState('speaking');
              setStatusText("Говорю...");
          } else if (inVol > 15) {
              setInteractionState('listening');
              setStatusText("Слушаю вас...");
          } else {
              setInteractionState('idle');
              setStatusText("Жду ответа...");
          }
      }, 200);
      return () => clearInterval(interval);
  }, [isConnected]);

  const disconnect = () => {
    sessionRef.current?.close();
    sessionRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    if (inputContextRef.current && inputContextRef.current.state !== 'closed') {
      inputContextRef.current.close();
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setIsConnected(false);
    setInteractionState("idle");
    setStatusText("Отключено");
  };

  useEffect(() => {
    if (isActive) {
      startSession();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [isActive]);

  const startSession = async () => {
    try {
      setStatusText("Подключение...");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      inputContextRef.current = audioCtx;

      const ws = new WebSocket("ws://localhost:8787");
      sessionRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setStatusText("Готов к работе");
        ws.send(JSON.stringify({ type: "start" }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "delta") {
          setTranscripts(prev => {
            const last = prev[prev.length - 1];
            if (last && !last.user) {
              return [...prev.slice(0, -1), { user: false, text: last.text + msg.text }];
            }
            return [...prev, { user: false, text: msg.text }];
          });
        }

        if (msg.type === "done") {
          setInteractionState("idle");
        }

        if (msg.type === "tool") {
          toolCallbackRef.current(msg.name, msg.args);
        }
      };

      ws.onerror = () => {
        setStatusText("Ошибка соединения");
        disconnect();
      };

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (!sessionRef.current || sessionRef.current.readyState !== WebSocket.OPEN) return;

        const input = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          pcm16[i] = Math.max(-1, Math.min(1, input[i])) * 32767;
        }

        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(pcm16.buffer))
        );

        sessionRef.current.send(JSON.stringify({
          type: "audio",
          audio: base64,
          mimeType: "audio/pcm;rate=16000"
        }));
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      startVisualizer();

    } catch (err) {
      console.error("Failed to start live session", err);
      disconnect();
      setStatusText("Ошибка доступа к микрофону");
    }
  };

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-white overflow-hidden bg-slate-900/95 backdrop-blur-3xl animate-in fade-in duration-300">
      
      {/* Dynamic Background Orbs */}
      <div className={`absolute top-0 right-0 w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-[120px] -z-10 transition-all duration-1000 ${interactionState === 'speaking' ? 'opacity-60 scale-110' : 'opacity-20 scale-100'}`}></div>
      <div className={`absolute bottom-0 left-0 w-[600px] h-[600px] bg-emerald-600/20 rounded-full blur-[120px] -z-10 transition-all duration-1000 ${interactionState === 'listening' ? 'opacity-60 scale-110' : 'opacity-20 scale-100'}`}></div>

      <button 
        onClick={onClose}
        className="absolute top-6 right-6 p-3 bg-white/5 rounded-full hover:bg-white/10 transition-colors border border-white/10"
      >
        <X size={24} className="text-slate-300" />
      </button>

      <div className="flex-1 w-full max-w-md flex flex-col items-center justify-between py-12">
        
        {/* Header Status */}
        <div className="flex flex-col items-center space-y-4">
             <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider transition-colors duration-500 ${
                 isConnected 
                 ? (interactionState === 'listening' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 
                    interactionState === 'speaking' ? 'bg-violet-500/10 border-violet-500/40 text-violet-400' : 
                    'bg-slate-500/10 border-slate-500/40 text-slate-400')
                 : 'bg-rose-500/10 border-rose-500/40 text-rose-400'
             }`}>
                {isConnected ? <Activity size={12} className="animate-pulse" /> : <WifiOff size={12} />}
                <span>{isConnected ? (interactionState === 'idle' ? 'Подключено' : interactionState === 'listening' ? 'Слушаю' : 'Отвечаю') : 'Оффлайн'}</span>
             </div>
             
             <h2 className="text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400">
                Ассистент
             </h2>
             <p className="text-slate-400 font-medium text-lg min-h-[28px] transition-all duration-300">
                {statusText}
             </p>
        </div>

        {/* Main Visualizer Area */}
        <div className="relative w-full h-48 flex items-center justify-center my-8">
             <canvas 
                ref={canvasRef} 
                width={360} 
                height={160} 
                className="w-full h-full object-contain"
             />
        </div>

        {/* Live Transcript View */}
        <div className="w-full h-48 overflow-y-auto space-y-3 rounded-[2rem] p-6 no-scrollbar mask-gradient bg-gradient-to-b from-white/5 to-transparent border border-white/5 relative shadow-inner">
            {transcripts.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-slate-500 text-sm p-6 opacity-60">
                    <Radio size={32} className="mb-3 opacity-50" />
                    <p className="mb-1">Скажите, что добавить</p>
                    <p className="font-bold text-slate-400">"Добавь хлеб и масло"</p>
                </div>
            )}
            {transcripts.map((t, i) => (
                <div key={i} className={`flex ${t.user ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm font-medium leading-relaxed shadow-sm ${
                        t.user 
                        ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/20' 
                        : 'bg-violet-500/20 text-violet-100 border border-violet-500/20'
                    }`}>
                        {t.text}
                    </div>
                </div>
            ))}
            <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })}></div>
        </div>
      </div>
      
      {/* Controls */}
      <div className="w-full max-w-md mt-4 flex justify-center pb-8">
         <button 
            onClick={() => {
               if (isConnected) disconnect();
               else startSession();
            }}
            className={`p-6 rounded-full transition-all duration-300 shadow-2xl border-4 hover:scale-105 active:scale-95 ${
                isConnected 
                ? 'bg-rose-500 hover:bg-rose-600 border-rose-400/30 ring-4 ring-rose-500/20' 
                : 'bg-emerald-500 hover:bg-emerald-600 border-emerald-400/30 ring-4 ring-emerald-500/20'
            }`}
         >
            {isConnected ? <Mic size={32} className="text-white animate-pulse" /> : <Zap size={32} className="text-white fill-white" />}
         </button>
      </div>
    </div>
  );
};

export default LiveAssistant;