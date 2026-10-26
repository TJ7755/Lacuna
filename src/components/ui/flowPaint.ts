/** Read intended classes/selection without sampling a live CSS colour transition. */
export function intendedFlowPaint(element: HTMLElement) {
  const probe = element.cloneNode(false) as HTMLElement;
  probe.removeAttribute('id');
  probe.classList.remove('flow-feedback');
  probe.dataset.flowPaintProbe = '';
  probe.setAttribute('aria-hidden', 'true');
  probe.inert = true;
  probe.style.cssText +=
    ';position:fixed!important;visibility:hidden!important;pointer-events:none!important;transition:none!important;animation:none!important;';
  element.parentElement?.append(probe);
  const style = getComputedStyle(probe);
  const background = style.backgroundColor;
  const ink = style.color;
  const border = style.borderColor;
  const borderWidth = parseFloat(style.borderTopWidth) || 0;
  const radius = parseFloat(style.borderTopLeftRadius) || 0;
  const corner = style.getPropertyValue('corner-shape');
  const power = Number.parseFloat(corner.match(/superellipse\(([-.\d]+)\)/)?.[1] ?? 'NaN');
  const exponent = Number.isFinite(power) ? 2 ** power : corner === 'squircle' ? 4 : 2;
  probe.remove();

  const transparent = background === 'transparent' || /rgba\([^)]*,\s*0\s*\)/.test(background);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d');
  let fill = background;
  if (context) {
    context.fillStyle = `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--paper')})`;
    context.fillRect(0, 0, 1, 1);
    const ancestors: Element[] = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement)
      ancestors.unshift(parent);
    for (const ancestor of ancestors) {
      context.fillStyle = getComputedStyle(ancestor).backgroundColor;
      context.fillRect(0, 0, 1, 1);
    }
    context.fillStyle = transparent ? ink : background;
    context.globalAlpha = transparent ? 0.055 : 1;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    fill = `rgb(${r}, ${g}, ${b})`;
  }
  return { fill, border, borderWidth, radius, exponent, transparent };
}

/** Give native paint back without animating through a transparent intermediate frame. */
export function restoreFlowPaint(element: HTMLElement) {
  const value = element.style.getPropertyValue('transition');
  const priority = element.style.getPropertyPriority('transition');
  element.style.setProperty('transition', 'none', 'important');
  element.classList.remove('flow-feedback');
  void getComputedStyle(element).backgroundColor;
  if (value) element.style.setProperty('transition', value, priority);
  else element.style.removeProperty('transition');
}
