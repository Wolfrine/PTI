import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, OnDestroy, ViewChild, computed, signal } from '@angular/core';
import { AtlasSector, AtlasSubject } from '../../services/atlas.models';
import type { NewAtlasComponent } from './new-atlas.component';

interface Point { x: number; y: number }
interface RadialDot extends Point { coverage: AtlasSubject['coverage'] }
interface RadialField {
  sector: AtlasSector;
  subjects: AtlasSubject[];
  number: string;
  wedge: string;
  leader: string;
  dots: RadialDot[];
  labelX: number;
  labelY: number;
  labelWidth: number;
  labelHeight: number;
  side: 'left' | 'right';
  quiet: string;
  active: string;
  accent: string;
}

interface RadialScene {
  width: number;
  height: number;
  cx: number;
  cy: number;
  centerSize: number;
  outerRadius: number;
  outerBands: { path: string; color: string }[];
  fields: RadialField[];
}

// Optional reading paths provide colour and rhythm, not a ranking or a taxonomy.
const PATHS = [
  { ids: ['foundations', 'life', 'planet', 'space'], quiet: '#e0efea', active: '#9fc7be', color: '#65948b' },
  { ids: ['computing', 'engineering', 'energy', 'built-world'], quiet: '#f4e9de', active: '#debb9f', color: '#bc8a70' },
  { ids: ['economy', 'society', 'culture', 'learning'], quiet: '#e9e9f0', active: '#c6c4d7', color: '#8d88ab' },
] as const;

const radians = (degrees: number): number => degrees * Math.PI / 180;
const polar = (cx: number, cy: number, radius: number, degrees: number): Point => ({
  x: cx + Math.cos(radians(degrees)) * radius,
  y: cy + Math.sin(radians(degrees)) * radius,
});
const annulus = (cx: number, cy: number, inner: number, outer: number, start: number, end: number): string => {
  const a = polar(cx, cy, outer, start);
  const b = polar(cx, cy, outer, end);
  const c = polar(cx, cy, inner, end);
  const d = polar(cx, cy, inner, start);
  return `M ${a.x} ${a.y} A ${outer} ${outer} 0 0 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${inner} ${inner} 0 0 0 ${d.x} ${d.y} Z`;
};
const arc = (cx: number, cy: number, radius: number, start: number, end: number): string => {
  const a = polar(cx, cy, radius, start);
  const b = polar(cx, cy, radius, end);
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 0 1 ${b.x} ${b.y}`;
};

@Component({
  selector: 'app-atlas-field',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './atlas-field.component.html',
  styleUrl: './atlas-field.component.scss',
})
export class AtlasFieldComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) context!: NewAtlasComponent;
  @ViewChild('radialCanvas') radialCanvas?: ElementRef<HTMLElement>;

  private observer?: ResizeObserver;
  readonly bounds = signal({ width: 1260, height: 440 });
  readonly scene = computed(() => this.buildScene(this.bounds().width, this.bounds().height));

  ngAfterViewInit(): void {
    const canvas = this.radialCanvas?.nativeElement;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    this.observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect?.width || !rect.height) return;
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      const previous = this.bounds();
      if (width !== previous.width || height !== previous.height) this.bounds.set({ width, height });
    });
    this.observer.observe(canvas);
  }

  ngOnDestroy(): void { this.observer?.disconnect(); }

  focusSector(sector: AtlasSector): void { this.context.fieldSectorId.set(sector.id); }

  onWedgeKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.context.openSector(this.scene().fields[index].sector);
      return;
    }
    const increment = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!increment) return;
    event.preventDefault();
    const fields = this.radialCanvas?.nativeElement.querySelectorAll<SVGGElement>('.radial-wedge');
    fields?.[(index + increment + this.scene().fields.length) % this.scene().fields.length]?.focus();
  }

  trackSector(_index: number, field: RadialField): string { return field.sector.id; }

  private buildScene(width: number, height: number): RadialScene {
    const cx = width / 2;
    const cy = height / 2;
    const outerRadius = Math.min(height * .416, width * .233);
    const innerRadius = outerRadius * .685;
    const labelHeight = height * .137;
    const labelWidth = Math.min(405, Math.max(144, cx - outerRadius - 81));
    const sectors = PATHS.flatMap(path => path.ids).map(id => this.context.sectors.find(sector => sector.id === id)!).filter(Boolean);
    const fields = sectors.map((sector, index): RadialField => {
      const path = PATHS[Math.floor(index / 4)];
      const angle = -75 + index * 30;
      const start = -90 + index * 30 + 1.6;
      const end = -90 + (index + 1) * 30 - 1.6;
      const right = Math.cos(radians(angle)) >= 0;
      const rank = right ? index : sectors.length - 1 - index;
      // Reserve the lower caption band even in a 590px-tall browser window.
      const labelY = height * .025 + rank * (height * .758 / 5);
      const labelX = right ? cx + outerRadius + 56 : cx - outerRadius - 56 - labelWidth;
      const lineX = right ? labelX - 11 : labelX + labelWidth + 11;
      const endpoint = polar(cx, cy, outerRadius + 2, angle);
      const joint = polar(cx, cy, outerRadius + 16, angle);
      const subjects = sector.subjectIds
        .map(id => this.context.subjects.find(subject => subject.id === id))
        .filter((subject): subject is AtlasSubject => !!subject);
      return {
        sector, subjects, number: String(this.context.sectors.indexOf(sector) + 1).padStart(2, '0'),
        wedge: annulus(cx, cy, innerRadius, outerRadius, start, end),
        leader: `M ${endpoint.x} ${endpoint.y} L ${joint.x} ${joint.y} L ${lineX} ${labelY + labelHeight * .48}`,
        dots: subjects.map((subject, dotIndex) => ({
          ...polar(cx, cy, innerRadius + (outerRadius - innerRadius) * .75, start + (end - start) * (dotIndex + 1) / (subjects.length + 1)),
          coverage: subject.coverage,
        })),
        labelX, labelY, labelWidth, labelHeight,
        side: right ? 'right' : 'left', quiet: path.quiet, active: path.active, accent: path.color,
      };
    });
    return {
      width, height, cx, cy, outerRadius, centerSize: (innerRadius - 5) * 2,
      outerBands: PATHS.map((path, index) => ({
        path: arc(cx, cy, outerRadius + 15, -90 + index * 120 + 3, -90 + index * 120 + 117),
        color: path.color,
      })),
      fields,
    };
  }
}
