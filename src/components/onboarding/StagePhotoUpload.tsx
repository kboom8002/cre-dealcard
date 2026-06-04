"use client";

import { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Camera, Upload, CheckCircle2 } from "lucide-react";
import { hapticLight, hapticSuccess } from "./HapticFeedback";

interface StagePhotoUploadProps {
  onPhotoSelected: (file: File) => void;
}

export function StagePhotoUpload({ onPhotoSelected }: StagePhotoUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function processFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    hapticLight();
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleZoneClick() {
    if (preview) return; // already selected, don't re-open
    fileInputRef.current?.click();
  }

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(true);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit() {
    if (!selectedFile) return;
    hapticSuccess();
    onPhotoSelected(selectedFile);
  }

  function handleReset() {
    setPreview(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 pt-20 pb-8"
      style={{ background: "linear-gradient(180deg, #09090b 0%, #0f0f12 100%)" }}
    >
      {/* Header */}
      <motion.div
        className="text-center mb-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2 className="text-2xl font-bold text-white mb-2">사진 업로드</h2>
        <p className="text-sm text-white/50">
          얼굴이 잘 보이는 사진을 사용하세요
        </p>
      </motion.div>

      {/* Upload zone */}
      <motion.div
        className="relative cursor-pointer select-none"
        style={{ width: 200, height: 200 }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        onClick={!preview ? handleZoneClick : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Dashed circular border */}
        <div
          className="absolute inset-0 rounded-full transition-all duration-300"
          style={{
            border: isDragging
              ? "2px solid rgba(99,102,241,0.9)"
              : preview
                ? "2px solid rgba(34,197,94,0.6)"
                : "2px dashed rgba(255,255,255,0.2)",
            boxShadow: isDragging
              ? "0 0 24px rgba(99,102,241,0.3)"
              : "none",
          }}
        />

        {/* Shimmer ring when no photo */}
        {!preview && (
          <div
            className="absolute inset-0 rounded-full animate-shimmer"
            style={{
              background:
                "linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.05) 50%, transparent 75%)",
              backgroundSize: "200% 100%",
            }}
          />
        )}

        {/* Content */}
        <div className="absolute inset-2 rounded-full overflow-hidden flex items-center justify-center bg-white/[0.03]">
          <AnimatePresence mode="wait">
            {preview ? (
              <motion.div
                key="preview"
                className="relative w-full h-full"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.3 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Selected photo"
                  className="w-full h-full object-cover"
                />
                {/* Overlay checkmark */}
                <div className="absolute inset-0 flex items-end justify-center pb-3 bg-gradient-to-t from-black/40 to-transparent">
                  <CheckCircle2 size={24} className="text-green-400" />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                className="flex flex-col items-center gap-3 p-6 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Upload size={32} className="text-white/30" />
                <p className="text-xs text-white/40 leading-relaxed">
                  클릭하거나
                  <br />
                  여기에 드롭
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Camera / re-select buttons */}
      <motion.div
        className="flex gap-3 mt-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        {!preview ? (
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.7)",
            }}
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera size={15} />
            카메라
          </button>
        ) : (
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all active:scale-95"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.45)",
            }}
            onClick={handleReset}
          >
            다시 선택
          </button>
        )}
      </motion.div>

      {/* Note */}
      <motion.p
        className="mt-5 text-xs text-white/35 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
      >
        얼굴이 잘 보이는 사진을 사용하세요
        <br />
        개인 정보는 분석 후 즉시 삭제됩니다
      </motion.p>

      {/* CTA */}
      <motion.button
        className="mt-8 w-full max-w-xs rounded-2xl py-4 text-base font-bold tracking-wide transition-all active:scale-[0.97]"
        style={{
          background: selectedFile
            ? "linear-gradient(135deg, #2563eb 0%, #6366f1 100%)"
            : "rgba(255,255,255,0.06)",
          color: selectedFile ? "#ffffff" : "rgba(255,255,255,0.25)",
          boxShadow: selectedFile
            ? "0 4px 24px rgba(99,102,241,0.35)"
            : "none",
          cursor: selectedFile ? "pointer" : "not-allowed",
        }}
        disabled={!selectedFile}
        onClick={handleSubmit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        분석 시작 →
      </motion.button>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
