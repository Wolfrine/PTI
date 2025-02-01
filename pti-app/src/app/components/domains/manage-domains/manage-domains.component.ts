import { Component, OnInit } from '@angular/core';
import { DomainService } from '../../../services/domain.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-manage-domains',
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-domains.component.html',
  styleUrl: './manage-domains.component.scss',
})
export class ManageDomainsComponent implements OnInit {
  domains: any[] = [];
  isEditing = false;
  domainData = { id: '', name: '', color: '#000000', progress: 0 };

  constructor(private domainService: DomainService) {}

  ngOnInit() {
    this.fetchDomains();
  }

  fetchDomains() {
    this.domainService.getDomains().subscribe((data) => {
      this.domains = data;
    });
  }

  addDomain() {
    if (!this.domainData.name) return;
    if (!this.isEditing) {
      this.domainData.id = `domain-${Math.random().toString(36).substr(2, 9)}`;
      this.domainService.addDomain(this.domainData);
    } else {
      this.domainService.updateDomain(this.domainData.id, this.domainData);
      this.isEditing = false;
    }
    this.domainData = { id: '', name: '', color: '#000000', progress: 0 };
  }

  editDomain(domain: any) {
    this.domainData = { ...domain };
    this.isEditing = true;
  }

  deleteDomain(domainId: string) {
    this.domainService.deleteDomain(domainId);
  }
}
