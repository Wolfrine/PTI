import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})

export class AppComponent implements OnInit {
  title="PTI App";
  constructor(public authService: AuthService) {}

  ngOnInit() {
    setTimeout(() => {
      this.authService.initGoogleOneTap(); // ✅ Delayed execution to avoid conflicts
      this.authService.checkUserSession();
    }, 1000); // ✅ Small delay to allow page initialization
  }
}