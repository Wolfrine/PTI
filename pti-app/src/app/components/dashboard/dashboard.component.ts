import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Chart,
  ChartConfiguration,
  ChartOptions,
  registerables,
} from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { DomainService } from '../../services/domain.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

// ✅ Register required Chart.js components
Chart.register(...registerables);

interface Domain {
  name: string;
  progress: number;
  color: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, BaseChartDirective], // ✅ Only import BaseChartDirective
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  user: any;
  domains: Domain[] = [];
  polarChartLabels: string[] = [];
  polarChartData: ChartConfiguration<'polarArea'>['data'] = {
    labels: [],
    datasets: [],
  };

  // ✅ Fix: Directly define as a string instead of ChartType
  polarChartType = 'polarArea'; // Fix: Removed explicit ChartType typing

  polarChartOptions: ChartOptions<'polarArea'> = {
    responsive: true,
    plugins: {
      legend: {
        position: 'right', // Move legend to right
      },
    },
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: {
          stepSize: 20,
        },
      },
    },
  };

  constructor(
    private domainService: DomainService,
    public authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.authService.user$.subscribe((user) => {
      this.user = user;
    });

    this.domainService.getDomains().subscribe((data) => {
      this.domains = data.map((d) => ({
        name: d.name,
        progress: d.progress || 0,
        color: d.color || '#007bff',
      }));

      // ✅ Assign Labels & Data
      this.polarChartLabels = this.domains.map((d) => d.name);
      this.polarChartData = {
        labels: this.polarChartLabels,
        datasets: [
          {
            data: this.domains.map((d) => d.progress),
            backgroundColor: this.domains.map((d) => d.color),
            borderColor: '#ffffff',
            borderWidth: 2,
          },
        ],
      };

      console.log(
        'Polar Chart Data:',
        JSON.stringify(this.polarChartData, null, 2)
      );
    });
  }

  goToManageDomains() {
    this.router.navigate(['/domains']);
  }

  logout() {
    this.authService.signOut();
  }
}
