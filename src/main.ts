import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
}
void bootstrap();
