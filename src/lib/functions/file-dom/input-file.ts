export function inputFile(el: HTMLInputElement, action: (fileList: FileList) => void) {
  const handleChange = () => {
    if (el.files?.length) {
      action(el.files);

      el.value = '';
    }
  };

  el.addEventListener('change', handleChange);

  return {
    destroy() {
      el.removeEventListener('change', handleChange);
    }
  };
}
