import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ServiceCatalogService } from './service-catalog.service';

type ItinerariesQuery = {
  date?: string;
};

type DeparturesQuery = {
  itineraryId?: string;
  date?: string;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DRIVER', 'ADMIN')
@Controller('service-catalog')
export class ServiceCatalogController {
  constructor(private readonly serviceCatalogService: ServiceCatalogService) {}

  @Get('itineraries')
  itineraries(@Query() query: ItinerariesQuery) {
    return this.serviceCatalogService.listItineraries(query.date ?? '');
  }

  @Get('departures')
  departures(@Query() query: DeparturesQuery) {
    return this.serviceCatalogService.listDepartures(query.itineraryId ?? '', query.date ?? '');
  }

  @Get('buses')
  buses() {
    return this.serviceCatalogService.listBuses();
  }
}
