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
import { TargetTaskService } from '../../services/target-task.service';
import { LocalStorageService } from '../../services/local-storage.service';
import { Router } from '@angular/router';

Chart.register(...registerables);

interface Domain {
  id: string;
  name: string;
  progress: number;
  color: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
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

  polarChartType = 'polarArea';
  polarChartOptions: ChartOptions<'polarArea'> = {
    responsive: true,
    plugins: { legend: { position: 'top' } },
    scales: {
      r: { min: 0, max: 100, ticks: { stepSize: 5 } },
    },
  };

  // ✅ Define Donut Charts for Time-Based Tracking
  donutChartType = 'doughnut';
  donutChartDataLast1Day!: ChartConfiguration<'doughnut'>['data'];
  donutChartDataLast7Days!: ChartConfiguration<'doughnut'>['data'];
  donutChartDataLast1Month!: ChartConfiguration<'doughnut'>['data'];

  chartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    plugins: { legend: { display: false } },
    cutout: '70%',
  };

  constructor(
    private domainService: DomainService,
    private authService: AuthService,
    private targetTaskService: TargetTaskService,
    private localStorageService: LocalStorageService,
    private router: Router
  ) {}

  async ngOnInit() {
    this.authService.initGoogleOneTap();
    this.authService.checkUserSession();
    this.authService.user$.subscribe((user) => {
      this.user = user;
    });

    // ✅ Fetch domain progress data
    this.domainService.getDomains().subscribe((data) => {
      this.domains = data.map((d) => ({
        id: d.id,
        name: d.name,
        progress: d.progress || 0,
        color: d.color || '#007bff',
      }));

      this.polarChartLabels = this.domains.map((d) => d.name);
      const maxProgress = Math.min(
        Math.max(...this.domains.map((d) => d.progress)) + 5,
        100
      );
      const stepSize = Math.ceil(maxProgress / 7);
      this.polarChartOptions.scales!['r']!.max = maxProgress;
      this.polarChartOptions.scales!['r']!.ticks!.stepSize = stepSize;

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
    });

    // ✅ Maintain Time-Based Data
    const isTimeDataAvailable =
      this.localStorageService.isTimeDataForTodayAvailable();
    if (!isTimeDataAvailable) {
      console.log('Fetching completed tasks to update time-spent stats...');
      await this.updateTimeSpentData();
    }

    // ✅ Load Chart Data from Local Storage
    this.loadDonutChartData();
  }

  async updateTimeSpentData() {
    const completedTasks = await this.targetTaskService.getCompletedTasksSince(
      30
    ); // Fetch last 30 days
    const now = new Date().getTime();

    console.log(completedTasks);

    let timeLast1Day = 0,
      timeLast7Days = 0,
      timeLast1Month = 0;

    completedTasks.forEach((task) => {
      const completedTime = task.completedTime || 0;
      console.log(
        'Now :' +
          now +
          ' - completionDate :' +
          new Date(task.completionDate).getTime()
      );

      if (!task.completionDate?.seconds) {
        console.warn(
          `⚠️ Skipping task ${task.id} due to invalid completionDate`,
          task
        );
        return; // Skip processing if completionDate is missing or malformed
      }
      const completionDate = new Date(task.completionDate.seconds * 1000);
      const timeDiff = now - completionDate.getTime();
      console.log('TimeDiff :' + timeDiff);
      if (timeDiff <= 24 * 60 * 60 * 1000) timeLast1Day += completedTime;
      if (timeDiff <= 7 * 24 * 60 * 60 * 1000) timeLast7Days += completedTime;
      if (timeDiff <= 30 * 24 * 60 * 60 * 1000) timeLast1Month += completedTime;
    });

    // ✅ Store results in Local Storage
    this.localStorageService.setTimeSpentLastNDays(1, timeLast1Day);
    this.localStorageService.setTimeSpentLastNDays(7, timeLast7Days);
    this.localStorageService.setTimeSpentLastNDays(30, timeLast1Month);
    this.localStorageService.setTimeDataForToday();

    // ✅ Reload chart data
    this.loadDonutChartData();
  }

  loadDonutChartData() {
    this.donutChartDataLast1Day = this.generateDonutChartData(
      24,
      this.localStorageService.getTimeSpentLastNDays(1)
    );
    this.donutChartDataLast7Days = this.generateDonutChartData(
      168,
      this.localStorageService.getTimeSpentLastNDays(7)
    );
    this.donutChartDataLast1Month = this.generateDonutChartData(
      720,
      this.localStorageService.getTimeSpentLastNDays(30)
    );
  }

  generateDonutChartData(
    maxValue: number,
    timeSpent: number
  ): ChartConfiguration<'doughnut'>['data'] {
    const unusedTime = Math.max(0, maxValue - timeSpent);

    return {
      labels: ['Time Spent', 'Unused Time'],
      datasets: [
        {
          data: [timeSpent, unusedTime],
          backgroundColor: ['#007bff', '#e0e0e0'],
        },
      ],
    };
  }

  goToManageDomains() {
    this.router.navigate(['/domains']);
  }

  goToDomain(domain: { id: string; name: string }) {
    this.router.navigate(['/domains', domain.id], {
      queryParams: { name: domain.name },
    });
  }

  logout() {
    this.authService.signOut();
  }
}
