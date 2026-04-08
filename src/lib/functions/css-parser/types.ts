export interface CssTree {
  type: 'stylesheet';
  stylesheet: Stylesheet;
}

export interface Stylesheet {
  rules: Rule[];
}

export interface Rule {
  type: 'page' | 'rule';
  selectors: string[];
  declarations: Declaration[];
}

export interface Declaration {
  type: 'declaration';
  property: string;
  value: string;
}
