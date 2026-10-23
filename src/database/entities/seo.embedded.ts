import { Column } from 'typeorm';

export class Seo {
  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;
}
