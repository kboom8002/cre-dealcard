"use client";

import { useState, useRef } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceRecorderProps {
  onTranscriptionComplete: (text: string) => void;
  onError: (error: string) => void;
}

export function VoiceRecorder({ onTranscriptionComplete, onError }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        await processAudio(audioBlob);
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied or error:", err);
      onError("마이크 권한이 거부되었거나 오류가 발생했습니다.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
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
        <div className="flex flex-col items-center space-y-6">
          <div className="relative">
            <div className="absolute inset-0 bg-destructive/20 rounded-full animate-ping"></div>
            <div className="w-24 h-24 bg-destructive/10 rounded-full flex items-center justify-center relative">
              <Mic className="w-10 h-10 text-destructive animate-pulse" />
            </div>
          </div>
          <p className="text-sm font-medium text-destructive animate-pulse">녹음 중...</p>
          <Button variant="destructive" size="lg" onClick={stopRecording} className="w-full max-w-xs rounded-full shadow-lg">
            <Square className="w-5 h-5 mr-2" />
            녹음 완료
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center space-y-6">
          <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center">
            <Mic className="w-10 h-10 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            가운데 버튼을 눌러 말씀하세요.<br/>
            예: "성수 80억 꼬마빌딩 1층 카페"
          </p>
          <Button onClick={startRecording} size="lg" className="w-full max-w-xs rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground">
            <Mic className="w-5 h-5 mr-2" />
            음성 메모 시작
          </Button>
        </div>
      )}
    </div>
  );
}
