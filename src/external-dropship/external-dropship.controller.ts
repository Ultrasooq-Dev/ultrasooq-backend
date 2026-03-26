import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/AuthGuard';
import { ExternalDropshipService } from './external-dropship.service';
import { Response } from 'express';

@ApiTags('external-dropship')
@ApiBearerAuth('JWT-auth')
@Controller('external-dropship')
export class ExternalDropshipController {
  constructor(
    private readonly externalDropshipService: ExternalDropshipService,
  ) {}

  @UseGuards(AuthGuard)
  @Post('/stores/create')
  createStore(@Request() req, @Body() payload: { name: string; platform?: string; settings?: any }) {
    return this.externalDropshipService.createStore(req.user.id, payload);
  }

  @UseGuards(AuthGuard)
  @Get('/stores/list')
  listStores(@Request() req) {
    return this.externalDropshipService.listStores(req.user.id);
  }

  @UseGuards(AuthGuard)
  @Post('/stores/:storeId/subscribe-products')
  subscribeProducts(
    @Request() req,
    @Param('storeId') storeId: string,
    @Body()
    payload: {
      productIds: number[];
      externalProductIdMap?: Record<number, string>;
      externalSkuMap?: Record<number, string>;
    },
  ) {
    return this.externalDropshipService.subscribeProducts(
      req.user.id,
      parseInt(storeId, 10),
      payload,
    );
  }

  @UseGuards(AuthGuard)
  @Get('/stores/:storeId/subscribed-products')
  getSubscribedProducts(@Request() req, @Param('storeId') storeId: string) {
    return this.externalDropshipService.getSubscribedProducts(
      req.user.id,
      parseInt(storeId, 10),
    );
  }

  @Get('/feeds/:feedToken/products.json')
  async getProductFeedJson(@Param('feedToken') feedToken: string) {
    return this.externalDropshipService.getProductFeed(feedToken, 'json');
  }

  @Get('/feeds/:feedToken/products.xml')
  async getProductFeedXml(
    @Param('feedToken') feedToken: string,
    @Res() res: Response,
  ) {
    const result = await this.externalDropshipService.getProductFeed(
      feedToken,
      'xml',
    );
    if (!result.status) {
      return res.status(404).json(result);
    }
    res.set('Content-Type', 'application/xml');
    return res.send(result.data);
  }

  @Get('/feeds/:feedToken/products.csv')
  async getProductFeedCsv(
    @Param('feedToken') feedToken: string,
    @Res() res: Response,
  ) {
    const result = await this.externalDropshipService.getProductFeed(
      feedToken,
      'csv',
    );
    if (!result.status) {
      return res.status(404).json(result);
    }
    res.set('Content-Type', 'text/csv');
    return res.send(result.data);
  }

  @Post('/webhooks/:feedToken/orders')
  handleOrderWebhook(
    @Param('feedToken') feedToken: string,
    @Body() payload: any,
  ) {
    return this.externalDropshipService.handleOrderWebhook(feedToken, payload);
  }
}
