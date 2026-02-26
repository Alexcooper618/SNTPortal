package ru.snt.portal.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue

@Composable
fun PhoneField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val visualValue = remember(value) {
        val formatted = formatRuPhoneForDisplay(value)
        TextFieldValue(
            text = formatted,
            selection = TextRange(formatted.length),
        )
    }

    OutlinedTextField(
        value = visualValue,
        onValueChange = { next ->
            onValueChange(normalizeRuPhoneInput(next.text))
        },
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        label = { Text("Телефон") },
        placeholder = { Text("+7 (000) 000-00-00") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
        trailingIcon = {
            if (value.length > 2) {
                IconButton(onClick = { onValueChange("+7") }) {
                    Icon(Icons.Outlined.Close, contentDescription = "Очистить номер")
                }
            }
        },
    )
}

private fun formatRuPhoneForDisplay(raw: String): String {
    val digits = normalizeRuPhoneInput(raw).filter(Char::isDigit).drop(1).padEnd(10, '_').take(10)
    val area = digits.take(3)
    val first = digits.drop(3).take(3)
    val second = digits.drop(6).take(2)
    val third = digits.drop(8).take(2)
    return "+7 ($area) $first-$second-$third"
}

private fun normalizeRuPhoneInput(raw: String): String {
    val digits = raw.filter { it.isDigit() }
    if (digits.isEmpty()) return "+7"

    val normalized = when {
        digits.startsWith("7") -> digits
        digits.startsWith("8") -> "7${digits.drop(1)}"
        else -> "7$digits"
    }.take(11)

    return "+$normalized"
}
