@echo off
cd /d C:\Users\Win11\Downloads\gradius-erp
git add components/ceo/DepositTab.tsx components/ceo/TaxInvoiceTab.tsx components/ceo/PaymentTab.tsx components/ceo/ProfitTab.tsx
git commit -m "CEO 페이지 전체 필터링 강화 (기간필터/전체보기탭/수익률필터/엑셀내보내기)"
git push
echo.
echo === 완료! 이 창을 닫아도 됩니다. ===
pause
