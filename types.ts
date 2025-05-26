/**
 * Core types for FoxVox Chrome Extension
 */

export interface Template {
  name: string;
  generation: string;
}

export interface Templates {
  [key: string]: Template;
}

export interface Config {
  templates: Templates;
  api: {
    key: string;
  };
}

export interface NodeData {
  xpath: string;
  layout: {
    left: number;
    top: number;
  };
  innerHTML: string;
  plainText: string;
}

export interface GeneratedNode {
  xpath: string;
  html: string;
}

export interface NodeWeight {
  htmlWeight: number;
  contentWeight: number;
}

export interface ChromeMessage {
  action: string;
  id?: number;
  url?: string;
  template?: Template;
  templates?: Templates;
  key?: string;
  openai?: string;
  template_name?: string;
}

export interface PopupState {
  isGenerating: boolean;
  currentEmojiIndex: number;
  emojiInterval: number;
} 