/** JSON body for tools/tests; normal clients use multipart `input` + `files` + `urls`. */
export class ExtractRuleRequestDto {
  input!: string;
}

export class ExtractRuleResponseDto {
  ruleId!: string;
}
