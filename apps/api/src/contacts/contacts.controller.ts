import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Permission } from '@crm/shared';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { RequirePermissions } from '../common/rbac/permissions.decorator';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  @RequirePermissions(Permission.CONTACTS_VIEW)
  list(
    @Query('q') q?: string,
    @Query('accountId') accountId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contacts.list({
      q,
      accountId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions(Permission.CONTACTS_VIEW)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.contacts.findOne(id);
  }

  @Post()
  @RequirePermissions(Permission.CONTACTS_CREATE)
  create(@Body() dto: CreateContactDto) {
    return this.contacts.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.CONTACTS_EDIT)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContactDto) {
    return this.contacts.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.CONTACTS_EDIT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.contacts.remove(id);
  }
}
