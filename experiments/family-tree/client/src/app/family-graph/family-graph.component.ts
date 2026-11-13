import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, Output, ViewChild } from '@angular/core';
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
  @Input() title = '';
  @Input() subtitle = '';
  @Input() photoUrl: (path: string) => string = (path) => path;
  @Output() personSelected = new EventEmitter<string>();

  @ViewChild('viewport') viewport?: ElementRef<HTMLElement>;

  layout: GraphLayout = { nodes: [], edges: [], width: 0, height: 0, generations: 0 };
  scale = 1;
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
    this.scale = Math.max(0.3, +(this.scale - 0.1).toFixed(2));
  }

  fit(allowEnlarge = true): void {
    const available = this.viewport?.nativeElement.clientWidth ?? 0;
    if (!available || !this.layout.width) return;
    if (allowEnlarge) this.userZoomed = false;
    const fitScale = (available - 34) / this.layout.width;
    this.scale = Math.max(0.3, Math.min(allowEnlarge ? 1.2 : 1, +fitScale.toFixed(2)));
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
  }
}
