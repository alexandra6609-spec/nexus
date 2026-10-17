"use client"; // Required for file processing and client-side inference

import React, { useEffect, useRef, useState } from "react";
import { loadLiteRt, loadAndCompile, Tensor } from "@litertjs/core";
import type { CompiledModel } from "@litertjs/core";

declare global {
  interface Window {
    __litert_initialized?: boolean;
  }
}

export type ScannableDisease = "Stroke" | "Burns";

export default function DiseaseScanner() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [model, setModel] = useState<CompiledModel | null>(null);
  const [status, setStatus] = useState<string>("Compiling AI runtime...");
  const [result, setResult] = useState<string>("Pending...");
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // 1. Initialize the LiteRT WebAssembly runtime and load the model on mount
  useEffect(() => {
    async function setupApp() {
      try {
        // Initialize the LiteRT WebAssembly runtime components from CDN
        if (!window.__litert_initialized) {
          setStatus("Compiling AI runtime...");
          await loadLiteRt(
            "https://cdn.jsdelivr.net/npm/@litertjs/core/wasm/",
            { jspi: true },
          );
          window.__litert_initialized = true; // Mark as successfully mounted
        }

        // Load the converted .tflite file from your public folder
        let compiledModel: CompiledModel;
        try {
          setStatus("Attempting WebGPU compilation...");
          // Try high-performance GPU mode first
          compiledModel = await loadAndCompile("/stroke_model.tflite", {
            accelerator: "webgpu",
          });
          setStatus("Ready! Using WebGPU acceleration.");
        } catch (webGpuError: unknown) {
          console.warn(
            "WebGPU initialization failed, falling back to WASM:",
            webGpuError,
          );
          setStatus("Compiling fallback CPU environment...");

          // Fall back to universal WebAssembly CPU mode
          compiledModel = await loadAndCompile("/stroke_model.tflite", {
            accelerator: "wasm",
          });
          setStatus("Ready! Using WebAssembly CPU fallback.");
        }

        setModel(compiledModel);

        setStatus("Ready! Upload an image to analyze.");
      } catch (error: any) {
        console.error("LiteRT Load error:", error);
        // Fallback: If it's just a StrictMode initialization warning, let the user proceed
        if (error?.message && error.message.includes("already loading")) {
          setStatus("Ready! Upload an image to analyze.");
        } else {
          setStatus("Error loading AI engine.");
        }
      }
    }
    setupApp();
  }, []);

  // 2. Handle image upload, render it to canvas, and run model inference
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !model || !canvasRef.current) return;

    setStatus("Processing image...");

    // Generate an image preview URL for the UI layout
    const objectUrl = URL.createObjectURL(file);
    setImagePreview(objectUrl);

    const img = new Image();
    img.src = objectUrl;
    img.onload = async () => {
      if (!canvasRef.current || !model) return;

      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      // Draw the uploaded image perfectly resized onto our hidden 224x224 input canvas
      ctx.drawImage(img, 0, 0, 224, 224);

      // Extract raw image pixels [R, G, B, A, R, G, B, A...]
      const imageData = ctx.getImageData(0, 0, 224, 224).data;

      // Create a flat Float32 array matching PyTorch dimensions (1 * 3 channels * 224 * 224)
      const tensorInput = new Float32Array(1 * 224 * 224 * 3);
      let tensorIdx = 0;

      for (let i = 0; i < imageData.length; i += 4) {
        // Directly append Red, Green, and Blue values continuously
        tensorInput[tensorIdx] = (imageData[i] / 255.0 - 0.485) / 0.229; // R
        tensorInput[tensorIdx + 1] = (imageData[i + 1] / 255.0 - 0.456) / 0.224; // G
        tensorInput[tensorIdx + 2] = (imageData[i + 2] / 255.0 - 0.406) / 0.225; // B
        tensorIdx += 3;
      }

      // 3. Execute inference locally on the device (using WebGPU or Wasm)
      // (Run the inference layer)

      // a. Wrap your raw Float32Array into an official LiteRT Tensor object
      // Specify the exact tensor shape dimensions [Batch, Height, Width, Channels]
      // (Data type is inferred automatically from the Float32Array)
      const inputTensor = new Tensor(tensorInput, [1, 224, 224, 3]);

      // b. Pass that structured Tensor object into the "args_0" input key
      const outputs = await model.run({ args_0: inputTensor });

      console.log("LiteRT outputs object:", outputs);
      // Dynamically grab the first available tensor key inside the object
      const outputKey = Object.keys(outputs)[0];
      const outputTensor = outputs[outputKey];

      if (!outputTensor) {
        throw new Error(
          `Could not find an output tensor. Keys available: ${Object.keys(outputs).join(", ")}`,
        );
      }

      // c. Await the data buffer payload explicitly from the GPU
      const rawScores = await outputTensor.data();

      // d. Convert the native float buffer into a normal JS array to perform math
      const scores = Array.from(rawScores);

      // e. Clean up your tensor memory immediately to prevent memory leaks
      inputTensor.delete();
      outputTensor.delete();

      // Find the index with the highest probability score
      const maxScoreIdx = scores.indexOf(Math.max(...scores));

      // 4. Update the state with the string prediction (must match your dataset folders!)
      const classes = ["Stroke", "Undetermined", "Not a Stroke"];
      setResult(classes[maxScoreIdx]);
      setStatus("Scan complete!");
    };
  };

  return (
    <section id="stroke-scanner">
      <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 max-w-md mx-auto">
        <h2 className="text-xl font-bold mb-1 text-zinc-900 dark:text-zinc-100">
          Stroke Scanner
        </h2>
        <p className="text-sm font-medium text-zinc-500 mb-6">
          Status:{" "}
          <span className="text-blue-600 dark:text-blue-400 font-semibold">
            {status}
          </span>
        </p>

        {/* Image Preview Box */}
        <div className="relative overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800 aspect-square w-[224px] h-[224px] mb-6 shadow-inner flex items-center justify-center border border-dashed border-zinc-300 dark:border-zinc-700">
          {imagePreview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imagePreview}
              alt="Target upload preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-sm text-zinc-400 font-medium px-4 text-center">
              No image selected yet
            </span>
          )}
        </div>

        {/* Hidden processing canvas used to grab image pixels */}
        <canvas ref={canvasRef} width="224" height="224" className="hidden" />

        {/* Custom styled file upload button */}
        <label
          className={`w-full text-center py-3.5 px-6 font-bold rounded-xl text-white transition-all shadow-md active:scale-[0.98] transition-colors block ${
            model
              ? "bg-blue-600 hover:bg-blue-700 cursor-pointer shadow-blue-500/20"
              : "bg-zinc-400 cursor-not-allowed shadow-none"
          }`}
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            disabled={!model}
            className="hidden"
          />
          {imagePreview ? "Upload Different Image" : "Upload Image"}
        </label>

        {/* Detection Result String Display */}
        {result !== "Pending..." && (
          <div className="mt-6 border-t border-zinc-100 dark:border-zinc-800 pt-4 w-full text-center">
            <span className="text-xs uppercase tracking-wider text-zinc-400 font-bold">
              Detection Verdict
            </span>
            <h3 className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
              {result}
            </h3>
          </div>
        )}
      </div>
    </section>
  );
}
