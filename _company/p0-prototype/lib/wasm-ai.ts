/**
 * P0: 로컬 WASM AI 엔진 래퍼
 * - 실제 모델 파일(.wasm) 경로는 public/models/ai_engine.wasm 으로 매핑
 * - 데모 단계에서는 WASM 로딩 실패 시 Mock Inference로 폴백하여 UI 흐름 검증 가능
 */

type WasmModule = {
  runInference: (input: string) => Promise<string>;
};

let wasmInstance: WasmModule | null = null;
let wasmReady = false;

export async function loadLocalWasmModel(modelPath: string = '/models/ai_engine.wasm'): Promise<WasmModule> {
  if (wasmReady && wasmInstance) return wasmInstance;

  try {
    const response = await fetch(modelPath);
    if (!response.ok) throw new Error(`WASM 모델 로드 실패: ${response.status}`);
    const wasmBuffer = await response.arrayBuffer();

    // WebAssembly 인스턴스화 (표준 API)
    // 실제 WASM 모듈이 exports.runInference(text)를 export한다고 가정
    const { instance } = await WebAssembly.instantiate(wasmBuffer, {
      env: {
        memory: new WebAssembly.Memory({ initial: 256 }),
        abort: (msg, file, line, col) => console.error(`[WASM Abort] ${msg} at ${file}:${line}:${col}`)
      }
    });

    wasmInstance = instance.exports as unknown as WasmModule;
    wasmReady = true;
  } catch (err) {
    console.warn('[WASM] 모델 로드 실패 (데모용 Mock 모드로 전환). 실제 WASM 파일 배치 후 재시도하세요.', err);
    // P0 데모 폴백
    wasmInstance = {
      runInference: async (input: string) => {
        return `[DEMO] 로컬 WASM 엔진 시뮬레이션\nInput: "${input}"\nOutput: (로컬 모델 inference 결과 placeholder)`;
      }
    };
  }
  return wasmInstance;
}

export async function runLocalAI(input: string): Promise<string> {
  const engine = await loadLocalWasmModel();
  return engine.runInference(input);
}