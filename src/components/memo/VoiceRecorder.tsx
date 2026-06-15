"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Square, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceRecorderProps {
  onTranscriptionComplete: (text: string) => void;
  onError: (error: string) => void;
}

export function VoiceRecorder({ onTranscriptionComplete, onError }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Initialize SpeechRecognition if available
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = "ko-KR";
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let currentInterim = "";
          let currentFinal = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              currentFinal += event.results[i][0].transcript + " ";
            } else {
              currentInterim += event.results[i][0].transcript;
            }
          }
          setInterimText(currentInterim);
          if (currentFinal) setFinalText(prev => prev + currentFinal);
        };

        recognition.onerror = (event: any) => {
          if (event.error !== 'no-speech') {
             console.error("Speech recognition error", event.error);
             // Web Speech API failed, handle it
          }
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const startRecording = async () => {
    setFinalText("");
    setInterimText("");
    setIsRecording(true);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
         // Fallback if already started or error
         console.warn(e);
      }
    } else {
      // Fallback to MediaRecorder & API
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
          await processAudio(audioBlob);
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
      } catch (err) {
        console.error("Microphone access denied or error:", err);
        onError("마이크 권한이 거부되었거나 오류가 발생했습니다.");
        setIsRecording(false);
      }
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      // Wait a tick for final results to process, then complete
      setTimeout(() => {
        const result = (finalText + " " + interimText).trim();
        if (result) {
          onTranscriptionComplete(result);
        } else {
          onError("음성이 인식되지 않았습니다.");
        }
      }, 500);
    } else if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsProcessing(true);
    }
  };

  const processAudio = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("audio", blob, "memo.webm");

      const res = await fetch("/api/broker/memo/voice", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || "음성 인식에 실패했습니다.");
      }

      onTranscriptionComplete(json.data.text);
    } catch (err) {
      onError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      {isProcessing ? (
        <div className="flex flex-col items-center space-y-4 text-muted-foreground animate-pulse">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-sm">음성을 텍스트로 변환하고 있습니다...</p>
        </div>
      ) : isRecording ? (
        <div className="flex flex-col items-center space-y-6 w-full">
          <div className="relative">
            <div className="absolute inset-0 bg-destructive/20 rounded-full animate-ping"></div>
            <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center relative">
              <Mic className="w-8 h-8 text-destructive animate-pulse" />
            </div>
          </div>
          
          {recognitionRef.current && (
            <div className="w-full h-24 bg-muted/30 rounded-lg p-3 overflow-y-auto text-sm border border-border">
               <span className="text-foreground">{finalText}</span>
               <span className="text-muted-foreground italic"> {interimText}</span>
            </div>
          )}

          <Button variant="destructive" size="lg" onClick={stopRecording} className="w-full rounded-xl shadow-lg">
            <Square className="w-5 h-5 mr-2" />
            녹음 완료
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center space-y-6 w-full">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center">
            <Mic className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            가운데 버튼을 눌러 말씀하세요.<br/>
            예: "성수 80억 꼬마빌딩 1층 카페"
          </p>
          <Button onClick={startRecording} size="lg" className="w-full rounded-xl shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground">
            <Mic className="w-5 h-5 mr-2" />
            음성 메모 시작
          </Button>
        </div>
      )}
    </div>
  );
}
