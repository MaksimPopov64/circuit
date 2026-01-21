// electron.d.ts
export interface IElectronAPI {
    onNewCircuit: (callback: () => void) => void;
    onClearAll: (callback: () => void) => void;
    onSetMode: (callback: (event: any, mode: string) => void) => void;
    onToggleLegend: (callback: () => void) => void;
    onShowAbout: (callback: () => void) => void;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}