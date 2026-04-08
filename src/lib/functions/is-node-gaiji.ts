import { isElementGaiji } from './is-element-gaiji';

export function isNodeGaiji(node: Node) {
  if (!(node instanceof HTMLImageElement)) {
    return false;
  }
  return isElementGaiji(node);
}
