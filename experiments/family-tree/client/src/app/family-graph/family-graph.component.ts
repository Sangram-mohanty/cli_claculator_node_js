import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, ViewChild } from '@angular/core';
import { FamilyTree } from '../family.service';
import { GraphLayout, GraphLink, GraphPartners, GraphPerson, NODE_HEIGHT, NODE_WIDTH, PHOTO_SIZE, layoutFamilyGraph } from './family-graph.layout';

@Component({
  selector: 'app-family-graph',
  standalone: true,
  templateUrl: './family-graph.component.html',
  styleUrl: './family-graph.component.css'
})
export class FamilyGraphComponent implements OnChanges, AfterViewInit {
  @Input() people: GraphPerson[] = [];
  @Input() links: GraphLink[] = [];
  @Input() partners: GraphPartners[] = [];
  @Input() selectedId: string | null = null;
  @Input() family: FamilyTree | null = null;
  @Input() title = '';
  @Input() subtitle = '';
  @Input() photoUrl: (path: string) => string = (path) => path;
  @Output() personSelected = new EventEmitter<string>();

  @ViewChild('viewport') viewport?: ElementRef<HTMLElement>;

  layout: GraphLayout = { nodes: [], edges: [], width: 0, height: 0, generations: 0 };
  scale = 1;
  downloading = false;
  downloadError = '';
  expanded = false;
  readonly nodeWidth = NODE_WIDTH;
  readonly nodeHeight = NODE_HEIGHT;
  readonly photoSize = PHOTO_SIZE;
  /** Once the user zooms by hand, stop auto-fitting when the data changes. */
  private userZoomed = false;

  ngOnChanges(): void {
    this.layout = layoutFamilyGraph(this.people, this.links, this.partners);
    if (!this.userZoomed) setTimeout(() => this.fit(false));
  }

  ngAfterViewInit(): void {
    // Start zoomed out just enough for the whole tree to fit the screen width.
    setTimeout(() => this.fit(false));
  }

  zoomIn(): void {
    this.userZoomed = true;
    this.scale = Math.min(2, +(this.scale + 0.1).toFixed(2));
  }

  zoomOut(): void {
    this.userZoomed = true;
    this.scale = Math.max(0.1, +(this.scale - 0.1).toFixed(2));
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
    setTimeout(() => this.fit(false));
  }

  focusSelectedPerson(): void {
    if (!this.selectedId || !this.viewport) return;
    this.userZoomed = true;
    this.scale = 0.8;
    setTimeout(() => {
      const viewport = this.viewport?.nativeElement;
      if (!viewport) return;
      const node = Array.from(viewport.querySelectorAll<HTMLElement>('.portrait-node'))
        .find((element) => element.dataset['personId'] === this.selectedId);
      if (!node) return;
      const nodeRect = node.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      viewport.scrollTo({
        left: viewport.scrollLeft + nodeRect.left - viewportRect.left - (viewport.clientWidth - nodeRect.width) / 2,
        top: viewport.scrollTop + nodeRect.top - viewportRect.top - (viewport.clientHeight - nodeRect.height) / 2
      });
    });
  }

  @HostListener('document:keydown.escape')
  closeExpandedView(): void {
    if (this.expanded) this.toggleExpanded();
  }

  fit(allowEnlarge = true): void {
    const available = this.viewport?.nativeElement.clientWidth ?? 0;
    if (!available || !this.layout.width) return;
    if (allowEnlarge) this.userZoomed = false;
    const fitScale = (available - 34) / this.layout.width;
    this.scale = Math.max(0.1, Math.min(allowEnlarge ? 1.2 : 1, +fitScale.toFixed(2)));
  }

  async downloadPdf(): Promise<void> {
    const element = this.viewport?.nativeElement;
    if (!this.family || !this.people.length || !element) return;

    this.downloadError = '';
    this.downloading = true;
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);
      const width = element.scrollWidth;
      const height = element.scrollHeight;
      if (!width || !height) return;

      const scale = Math.min(2, 10000 / Math.max(width, height), Math.sqrt(40000000 / (width * height)));
      const canvas = await html2canvas(element, {
        scale,
        useCORS: true,
        onclone: (clonedDocument) => {
          const viewport = clonedDocument.querySelector<HTMLElement>('.parchment');
          if (!viewport) return;
          const style = clonedDocument.defaultView!.getComputedStyle(viewport);
          const fullWidth = viewport.scrollWidth;
          const fullHeight = viewport.scrollHeight;
          viewport.style.width = `${fullWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)}px`;
          viewport.style.height = `${fullHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)}px`;
          viewport.style.maxHeight = 'none';
          viewport.style.overflow = 'visible';
          viewport.scrollTop = 0;
          viewport.scrollLeft = 0;
          const header = viewport.querySelector<HTMLElement>('.parchment-header');
          if (header) header.style.position = 'static';
        }
      });

      const pdf = new jsPDF({
        orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      pdf.setProperties({ title: `${this.family.name} family graph`, subject: 'Family graph' });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);
      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const filename = this.family.name.trim().replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-').replace(/\s+/g, '-');
      link.href = url;
      link.download = `${filename || 'family'}-graph.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      console.error('Family graph PDF export failed.', error);
      this.downloadError = 'Could not create the PDF. Please try again.';
    } finally {
      this.downloading = false;
    }
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
  }
}
