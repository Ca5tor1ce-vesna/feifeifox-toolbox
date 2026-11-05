export {};

declare global {
  interface Window {
    GT_DIALOG(message: string, confirm?: boolean): Promise<boolean>;
    GT_INSTALL_SELECT_MENU?: () => void;
    GT_LOCAL_STATE: { scope(key: string): { bind(root: HTMLElement): () => void } };
  }
}
