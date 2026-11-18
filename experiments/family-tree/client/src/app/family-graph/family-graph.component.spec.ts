import { ElementRef } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { FamilyGraphComponent } from './family-graph.component';

describe('FamilyGraphComponent', () => {
  it('fits a wide family graph below the former zoom floor', () => {
    const component = new FamilyGraphComponent();
    component.layout = { nodes: [], edges: [], width: 4000, height: 1200, generations: 6 };
    component.viewport = new ElementRef({ clientWidth: 500 } as HTMLElement);

    component.fit();

    expect(component.scale).toBe(0.12);
  });

  it('toggles expanded view and closes it with Escape', () => {
    const component = new FamilyGraphComponent();

    component.toggleExpanded();
    expect(component.expanded).toBeTrue();
    component.closeExpandedView();
    expect(component.expanded).toBeFalse();
  });

  it('zooms in and centers the selected person', fakeAsync(() => {
    const component = new FamilyGraphComponent();
    const viewport = document.createElement('div');
    viewport.style.width = '400px';
    viewport.style.height = '300px';
    viewport.style.overflow = 'auto';
    const node = document.createElement('button');
    node.className = 'portrait-node';
    node.dataset['personId'] = 'person-1';
    node.style.width = '100px';
    node.style.height = '100px';
    viewport.appendChild(node);
    document.body.appendChild(viewport);
    component.viewport = new ElementRef(viewport);
    component.selectedId = 'person-1';
    spyOn(viewport, 'scrollTo').and.stub();

    component.focusSelectedPerson();
    tick();

    expect(component.scale).toBe(0.8);
    expect(viewport.scrollTo).toHaveBeenCalled();
    viewport.remove();
  }));

  it('downloads the rendered family graph as a PDF', async () => {
    const component = new FamilyGraphComponent();
    component.family = {
      _id: 'tree-1',
      name: 'Mohanty Family',
      village: 'Bahadalapur',
      state: 'Odisha',
      surname: 'Mohanty'
    };
    component.people = [{ _id: 'person-1', name: 'Ramesh', gender: 'Man', birthYear: 1970 }];
    const viewport = document.createElement('div');
    viewport.className = 'parchment';
    viewport.textContent = 'Rendered family graph';
    viewport.style.width = '400px';
    viewport.style.height = '300px';
    document.body.appendChild(viewport);
    component.viewport = new ElementRef(viewport);

    const createObjectUrl = spyOn(URL, 'createObjectURL').and.returnValue('blob:family-data');
    const createElement = document.createElement.bind(document);
    let downloadLink: HTMLAnchorElement | undefined;
    spyOn(document, 'createElement').and.callFake((tagName: string): HTMLElement => {
      const element = createElement(tagName);
      if (tagName === 'a') downloadLink = element as HTMLAnchorElement;
      return element;
    });
    spyOn(HTMLAnchorElement.prototype, 'click');

    await component.downloadPdf();
    viewport.remove();

    expect(downloadLink?.download).toBe('Mohanty-Family-graph.pdf');
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    const blob = createObjectUrl.calls.mostRecent().args[0] as Blob;
    expect(blob.type).toBe('application/pdf');
    const pdfContent = await blob.text();
    expect(pdfContent.startsWith('%PDF-')).toBeTrue();
  });
});
