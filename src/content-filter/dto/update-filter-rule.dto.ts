import { PartialType } from '@nestjs/swagger';
import { CreateFilterRuleDto } from './create-filter-rule.dto';

export class UpdateFilterRuleDto extends PartialType(CreateFilterRuleDto) {}
