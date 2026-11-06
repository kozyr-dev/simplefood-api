import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import mailConfig from '@/config/mail.config';
import { MailModule } from '@/mail/mail.module';
import { ContactController } from './controllers/contact.controller';
import { ContactSubmission } from './entities/contact-submission.entity';
import { ContactService } from './services/contact.service';

/** The site's contact form: POST /contact saves the message and emails the shop. */
@Module({
  imports: [
    ConfigModule.forFeature(mailConfig),
    TypeOrmModule.forFeature([ContactSubmission]),
    MailModule,
  ],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
